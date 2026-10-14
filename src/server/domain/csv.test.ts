import { describe, expect, it } from "vitest";

import { ValidationError } from "../errors";
import {
  applyMapping,
  escapeCsvCell,
  parseCsv,
  splitFullName,
  suggestMapping,
  toCsv,
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
    expect(() => parseCsv("Email,email\na@example.com,b@example.com")).toThrow(/duplicate/);
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

describe("splitFullName", () => {
  it("splits on the last space", () => {
    expect(splitFullName("Mary Ann  Evans")).toEqual({ firstName: "Mary Ann", lastName: "Evans" });
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
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
