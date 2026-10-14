import { describe, expect, it } from "vitest";

import { ValidationError } from "../errors";
import {
  applyMapping,
  escapeCsvCell,
  parseCsv,
  splitFullName,
  suggestMapping,
  toCsv,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
} from "./csv";

describe("parseCsv", () => {
  it("parses quoted cells, embedded newlines and a byte order mark", () => {
    const text =
      '﻿First name,Last name,Notes\r\nAda,Lovelace,"likes ""math"",\nand engines"\r\n\r\n';
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(["First name", "Last name", "Notes"]);
    expect(rows).toEqual([
      { "First name": "Ada", "Last name": "Lovelace", Notes: 'likes "math",\nand engines' },
    ]);
  });

  it("rejects files without a header or with duplicate headers", () => {
    expect(() => parseCsv("")).toThrow(ValidationError);
    expect(() => parseCsv("Email,Email\na@example.com,b@example.com")).toThrow(/duplicate/);
  });

  it("caps the number of rows", () => {
    const text = `Email\n${Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `u${i}@example.com`).join("\n")}`;
    expect(() => parseCsv(text)).toThrow(/at most/);
  });
});

describe("suggestMapping", () => {
  it("recognises common header spellings", () => {
    expect(
      suggestMapping([
        "First Name",
        "SURNAME",
        "E-mail",
        "Mobile",
        "Organisation",
        "Lead source",
        "Notes",
      ]),
    ).toEqual({
      "First Name": "firstName",
      SURNAME: "lastName",
      "E-mail": "email",
      Mobile: "phone",
      Organisation: "companyName",
      "Lead source": "source",
      Notes: null,
    });
  });

  it("maps each field only once", () => {
    expect(suggestMapping(["Email", "Email address"])).toEqual({
      Email: "email",
      "Email address": null,
    });
  });
});

describe("applyMapping", () => {
  it("keeps spreadsheet row numbers and drops unmapped or empty cells", () => {
    const rows = [
      { Given: "Ada", Mail: " ada@example.com ", Ignored: "x" },
      { Given: "", Mail: "grace@example.com", Ignored: "y" },
    ];
    expect(applyMapping(rows, { Given: "firstName", Mail: "email", Ignored: null })).toEqual([
      { rowNumber: 2, values: { firstName: "Ada", email: "ada@example.com" } },
      { rowNumber: 3, values: { email: "grace@example.com" } },
    ]);
  });
});

describe("Chinese and full-width headers", () => {
  it("accepts several Chinese column names and maps them", () => {
    const { headers } = parseCsv("名字,姓氏,電子郵件\n小明,王,ming@example.com");
    expect(headers).toEqual(["名字", "姓氏", "電子郵件"]);
    expect(suggestMapping(headers)).toEqual({
      名字: "firstName",
      姓氏: "lastName",
      電子郵件: "email",
    });
  });

  it("maps the Chinese aliases", () => {
    expect(
      suggestMapping(["名", "姓", "全名", "電子信箱", "手機", "公司", "職稱", "標籤"]),
    ).toEqual({
      名: "firstName",
      姓: "lastName",
      全名: "fullName",
      電子信箱: "email",
      手機: "phone",
      公司: "companyName",
      職稱: "jobTitle",
      標籤: "tags",
    });
    expect(suggestMapping(["姓名", "信箱", "電話", "Email"])).toEqual({
      姓名: "fullName",
      信箱: "email",
      電話: "phone",
      Email: null,
    });
  });

  it("normalises full-width letters and spacing", () => {
    expect(suggestMapping(["  Ｆｉｒｓｔ　Ｎａｍｅ ", "ＥＭＡＩＬ"])).toEqual({
      "  Ｆｉｒｓｔ　Ｎａｍｅ ": "firstName",
      ＥＭＡＩＬ: "email",
    });
  });

  it("only treats identical column names as duplicates", () => {
    expect(() => parseCsv("名字,姓氏,名字\na,b,c")).toThrow(/duplicate/);
    expect(parseCsv("Email,email\na@example.com,b@example.com").headers).toEqual([
      "Email",
      "email",
    ]);
  });
});

describe("row numbers", () => {
  it("match spreadsheet lines even after blank rows", () => {
    const text =
      "First name,Last name,Email\nAda,Lovelace,ada@example.com\nGrace,Hopper,grace@example.com\n\n,,\nBad,Email,not-an-email\n";
    const { headers, rows, rowNumbers } = parseCsv(text);
    expect(rowNumbers).toEqual([2, 3, 6]);
    expect(
      applyMapping(rows, suggestMapping(headers), rowNumbers).map((row) => row.rowNumber),
    ).toEqual([2, 3, 6]);
  });

  it("skip blank lines above the header and keep counting them", () => {
    const { headers, rows, rowNumbers } = parseCsv(
      "\n,\nFirst name,Last name\nAda,Lovelace\n\nGrace,Hopper\n",
    );
    expect(headers).toEqual(["First name", "Last name"]);
    expect(rows).toEqual([
      { "First name": "Ada", "Last name": "Lovelace" },
      { "First name": "Grace", "Last name": "Hopper" },
    ]);
    expect(rowNumbers).toEqual([4, 6]);
  });

  it("count a quoted multi-line cell as one row", () => {
    const text = 'Name,Notes\nAda Lovelace,"line one\nline two"\nGrace Hopper,x\n';
    expect(parseCsv(text).rowNumbers).toEqual([2, 3]);
  });

  it("measure the file size in bytes", () => {
    const text = `Name\n${"王".repeat(800_000)}`;
    expect(text.length).toBeLessThan(MAX_IMPORT_BYTES);
    expect(() => parseCsv(text)).toThrow(/larger than 2 MB/);
  });
});

describe("splitFullName", () => {
  it("splits Latin names on the last space", () => {
    expect(splitFullName("Mary Ann  Evans")).toEqual({ firstName: "Mary Ann", lastName: "Evans" });
    expect(splitFullName("Ada Lovelace")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("puts the family name first for Chinese, Japanese and Korean names", () => {
    expect(splitFullName("王小明")).toEqual({ lastName: "王", firstName: "小明" });
    expect(splitFullName("王明")).toEqual({ lastName: "王", firstName: "明" });
    expect(splitFullName("歐陽靜文")).toEqual({ lastName: "歐陽", firstName: "靜文" });
    expect(splitFullName("欧阳静文")).toEqual({ lastName: "欧阳", firstName: "静文" });
    expect(splitFullName("諸葛亮")).toEqual({ lastName: "諸葛", firstName: "亮" });
    expect(splitFullName("張簡美玲")).toEqual({ lastName: "張簡", firstName: "美玲" });
    expect(splitFullName("范姜孟")).toEqual({ lastName: "范姜", firstName: "孟" });
    expect(splitFullName("王 小明")).toEqual({ lastName: "王", firstName: "小明" });
    expect(splitFullName("山田 太郎")).toEqual({ lastName: "山田", firstName: "太郎" });
    expect(splitFullName("김 민준")).toEqual({ lastName: "김", firstName: "민준" });
  });

  it("returns null when a name cannot be split safely", () => {
    expect(splitFullName("Cher")).toBeNull();
    expect(splitFullName("王")).toBeNull();
    expect(splitFullName("愛新覺羅溥儀")).toBeNull();
    expect(splitFullName("   ")).toBeNull();
  });
});

describe("escapeCsvCell", () => {
  it("quotes separators, quotes and newlines", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(1250.5)).toBe("1250.5");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(escapeCsvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(escapeCsvCell("+1 555 0100")).toBe("'+1 555 0100");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell(-5)).toBe("-5");
  });
});

describe("toCsv", () => {
  it("writes a header and CRLF-terminated rows", () => {
    const csv = toCsv(
      [
        { key: "name", label: "Name" },
        { key: "when", label: "When" },
      ],
      [{ name: "Ada", when: new Date("2026-01-02T03:04:05Z") }],
    );
    expect(csv).toBe("Name,When\r\nAda,2026-01-02T03:04:05.000Z\r\n");
  });
});
