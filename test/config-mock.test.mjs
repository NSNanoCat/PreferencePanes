import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { rollup } from "rollup";
import builds from "../rollup.config.mjs";

test("config-only Mock returns JSON without storage, arguments or network", async () => {
    const bundle = await rollup(builds[3]);
    const { output } = await bundle.generate(builds[3].output);
    await bundle.close();
    const code = `${output[0].code}\nPreferencePanes.mock([{id:"@Root.Module.Settings.flag",type:"boolean",val:true}]);`;
    assert.doesNotMatch(code, /SettingsHandler|persistentStore|Storage\.getItem|httpClient\.get/);
    for (const quantumult of [false, true]) {
        for (const method of ["HEAD", "GET", "POST"]) {
            const response = await new Promise(resolve =>
                vm.runInNewContext(code, {
                    ...(quantumult ? { $task: {} } : { $environment: { "surge-version": "test" } }),
                    $request: { method, url: "https://example.org/configs/Module" },
                    $script: { startTime: Date.now() / 1000 },
                    $done: result => resolve(quantumult ? result : result.response),
                    console: { log() {}, error() {} },
                }),
            );
            assert.equal(quantumult ? Number(response.status.split(" ")[1]) : response.status, method === "POST" ? 405 : 200);
            if (method === "HEAD") assert.equal(response.body, "");
            if (method === "GET") assert.equal(JSON.parse(response.body)[0].val, true);
        }
    }
});
