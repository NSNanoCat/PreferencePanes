export const config = [
  { id: "@Example.Module.Settings.Home.enabled", name: "[Home] Enabled", type: "boolean", val: true },
  {
    id: "@Example.Module.Settings.Home.mode",
    name: "[Home] Mode",
    type: "selects",
    val: "a",
    items: [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ],
  },
  {
    id: "@Example.Module.Settings.items",
    name: "Items",
    type: "checkboxes",
    val: ["a"],
    items: [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ],
  },
  { id: "@Example.Module.Settings.note", name: "Note", type: "text", val: "" },
  { id: "@Example.Module.Settings.count", name: "Count", type: "number", val: "1" },
];
