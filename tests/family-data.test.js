const test = require("node:test");
const assert = require("node:assert/strict");
const FamilyData = require("../js/family-data.js");

const REAL_SHAPE_CSV = [
  "Guest name,Family,Relationship,Are they a Kid?",
  "Saif,Saifs Family,Grooms,",
  "Armani,Saifs Family,Grooms Brother,",
  "Sheine,Saifs Family,Grooms Mom,",
  "Habib,Habib Family,Grooms Uncle,",
  "Zaina,Tayyibah Family,Bride Niece,Yes",
  "Baji kausar,,,",
  ",,,",
  ",,,"
].join("\r\n");

test("parseCsv splits simple rows and columns", () => {
  const rows = FamilyData.parseCsv("a,b,c\n1,2,3");
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "2", "3"]]);
});

test("parseCsv handles quoted fields containing commas", () => {
  const rows = FamilyData.parseCsv('name,family\n"Khan, Junior",Sal Family');
  assert.deepEqual(rows[1], ["Khan, Junior", "Sal Family"]);
});

test("parseCsv handles escaped double quotes", () => {
  const rows = FamilyData.parseCsv('note\n"He said ""hi"""');
  assert.deepEqual(rows[1], ['He said "hi"']);
});

test("parseCsv handles CRLF line endings and drops empty trailing rows", () => {
  const rows = FamilyData.parseCsv("a,b\r\n1,2\r\n,\r\n,\r\n");
  assert.equal(rows.length, 2);
});

test("findHeaderRow locates the header even when junk rows sit above it", () => {
  const rows = FamilyData.parseCsv(
    "KEY:,,,\nYes,,,\nGuest name,Family,Relationship,Are they a Kid?\nSaif,Saifs Family,Grooms,"
  );
  assert.equal(FamilyData.findHeaderRow(rows), 2);
});

test("rowsToGuests maps fields by header name, not position", () => {
  const shuffled = [
    "Family,Are they a Kid?,Guest name,Relationship",
    "Saifs Family,,Saif,Grooms"
  ].join("\n");
  const guests = FamilyData.rowsToGuests(FamilyData.parseCsv(shuffled));
  assert.equal(guests.length, 1);
  assert.equal(guests[0].name, "Saif");
  assert.equal(guests[0].family, "Saifs Family");
  assert.equal(guests[0].relationship, "Grooms");
  assert.equal(guests[0].isKid, false);
});

test("rowsToGuests on a realistic mirror feed skips blank rows and flags kids", () => {
  const guests = FamilyData.rowsToGuests(FamilyData.parseCsv(REAL_SHAPE_CSV));
  assert.equal(guests.length, 6);
  const zaina = guests.find((g) => g.name === "Zaina");
  assert.equal(zaina.isKid, true);
  const baji = guests.find((g) => g.name === "Baji kausar");
  assert.equal(baji.family, "");
});

test("rowsToGuests returns empty array when no header row exists", () => {
  const guests = FamilyData.rowsToGuests(FamilyData.parseCsv("random,junk\n1,2"));
  assert.deepEqual(guests, []);
});

test("groupByFamily keeps sheet order and skips guests without a family", () => {
  const guests = FamilyData.rowsToGuests(FamilyData.parseCsv(REAL_SHAPE_CSV));
  const groups = FamilyData.groupByFamily(guests);
  assert.deepEqual(
    groups.map((g) => g.family),
    ["Saifs Family", "Habib Family", "Tayyibah Family"]
  );
  assert.equal(groups[0].members.length, 3);
  const allNames = groups.flatMap((g) => g.members.map((m) => m.name));
  assert.equal(allNames.includes("Baji kausar"), false);
});

test("splitRows returns one flat row when no Tree row values exist", () => {
  const members = [
    { name: "Habib", treeRow: "" },
    { name: "Zizi", treeRow: "" }
  ];
  const split = FamilyData.splitRows(members);
  assert.equal(split.parents.length, 0);
  assert.equal(split.children.length, 2);
});

test("splitRows splits parents above children when Tree row is filled", () => {
  const members = [
    { name: "Habib", treeRow: "parents" },
    { name: "Shaberia", treeRow: "Parents".toLowerCase() },
    { name: "Zizi", treeRow: "children" },
    { name: "Zain", treeRow: "" }
  ];
  const split = FamilyData.splitRows(members);
  assert.deepEqual(split.parents.map((m) => m.name), ["Habib", "Shaberia"]);
  assert.deepEqual(split.children.map((m) => m.name), ["Zizi", "Zain"]);
});
