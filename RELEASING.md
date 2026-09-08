# 发布 PreferencePanes

首版沿用 package.json 的 `0.1.0`，发布标签为 `v0.1.0`。包名为 `@nsnanocat/preference-panes`，与 NSNanoCat 其它 package 一样全部小写。

`0.1.0` 已于 2026-09-08 通过两个发布工作流完成首发。npm 和 GitHub Packages tarball 的 SHA-1 均为 `58f0ed3b056936a5e90b3406b802640ddca67c91`。npm 首发使用仓库 secret `NPM_TOKEN`；Trusted Publisher 尚待配置，因此暂时保留该 secret。

## 发布前验证

在要发布的提交上运行：

```sh
npm ci --registry=https://registry.npmjs.org/ --@nsnanocat:registry=https://registry.npmjs.org/
npm run build
npm run check
node scripts/generate-apifox.mjs --check
npm pack
```

普通 main/dev 推送和手动运行 CI 只验证并上传候选 tgz，不发布。下载 Actions 的 `preference-panes-package` artifact，可在消费者中用 `npm install --no-save --package-lock=false /path/to/package.tgz` 验证候选包。

## 首次注册 npm

npm 要求包已存在才能配置 Trusted Publisher。首次发布需要具有 `@nsnanocat` 发布权限的登录会话，或仓库中配置的 `NPM_TOKEN`；如果使用 token，必须满足 npm 的首发及 2FA 要求。不要将 token 写入源码或本地提交。

首发后在 npm 为此包添加 GitHub Trusted Publisher：

| 设置 | 值 |
| --- | --- |
| Organization | `NSNanoCat` |
| Repository | `PreferencePanes` |
| Workflow | `release-package-to-npm.yml` |

配置完成后移除首发 secret `NPM_TOKEN`，后续使用 OIDC。GitHub Packages 工作流使用该仓库自己的 `GITHUB_TOKEN`，需要 `packages: write`；不复用其它 package 的发布凭证。

## 发布与验收

确认候选包后，在同一提交创建并推送 `v0.1.0`。两个 `release-package-to-*.yml` 工作流分别发布 npm 和 GitHub Packages；版本取自 tag，预发布标签取版本的 prerelease 段，正式版本使用 latest。

两个发布任务都成功后，分别核对两个 registry 的版本和安装结果，再让 Enhanced 从正式 registry 安装并更新 package-lock.json。不要用本地 tgz 的路径或尚不存在的下载地址伪造正式 lockfile。包发布与 Enhanced 的 dev 部署分开验收；页面静态资源还需同步其托管仓库。

参考：[npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)、[npm trust 的前置条件](https://docs.npmjs.com/cli/v11/commands/npm-trust/)。
