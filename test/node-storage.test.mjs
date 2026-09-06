import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("Node ESM conditional export persists through util and a fresh process reads it", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "ns-settings-test-"));
  const entry = new URL("../index.mjs", import.meta.url).href;
  const script = `
    import { createSettingsHandler } from ${JSON.stringify(entry)};
    const handle = createSettingsHandler({ module: 'Node', endpoint: 'https://example.org/settings', storageKey: 'node-settings', fields: [{key:'enabled',name:'Enabled',type:'boolean',defaultValue:true}] });
    const req = {url:'https://example.org/settings',method:'GET',headers:{'X-Settings-Client':'1','Content-Type':'application/json'}};
    if (process.env.SETTINGS_TEST_WRITE) handle({...req,method:'POST',body:'{"values":{"enabled":false}}'});
    console.log(handle(req).body);
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd, env: { ...process.env, SETTINGS_TEST_WRITE: "1" } });
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd, encoding: "utf8" });
  assert.equal(JSON.parse(output).values.enabled, false);
  assert.equal(JSON.parse(JSON.parse(readFileSync(path.join(cwd, "box.dat"), "utf8"))["node-settings"]).enabled, false);
});
