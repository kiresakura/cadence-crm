import { TAG_COLOR_CLASSES } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Tag chips backed by native checkboxes, submitted as repeated `tagIds` values. */
export function TagPicker({
  tags,
  selected,
  error,
}: {
  tags: Array<{ id: string; name: string; color: string }>;
  selected: string[];
  error?: string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Tags</legend>
      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No tags yet. Admins can add them in Settings.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <label
              key={tag.id}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-xs font-medium opacity-60 transition has-checked:border-current has-checked:opacity-100 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                TAG_COLOR_CLASSES[tag.color] ?? TAG_COLOR_CLASSES.slate,
              )}
            >
              <input
                type="checkbox"
                name="tagIds"
                value={tag.id}
                defaultChecked={selected.includes(tag.id)}
                className="size-3 accent-current"
              />
              {tag.name}
            </label>
          ))}
        </div>
      )}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </fieldset>
  );
}
