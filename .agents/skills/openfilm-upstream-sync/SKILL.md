---
name: openfilm-upstream-sync
description: 将 openfilm/openfilm 的官方更新融合到 lsiten/openfilm，保留 fork 的播放器、嵌入式 Studio、会话隔离和 atelier 改进，并验证 Easel 集成。用户要求同步 OpenFilm 上游、更新 fork 或解决双方分歧时使用。
---

# OpenFilm 上游同步

吸收官方修复，保留 fork 仍然有效的改进。按行为和证据决定采用方式，不把“同步”做成覆盖 fork，也不为保留代码而重复实现。

## 确认当前仓库与远端

在 OpenFilm 自身仓库根执行，不能在 Easel 根操作父仓库来代替子项目提交。

| 用途 | 地址 / 分支 |
| --- | --- |
| 官方上游 | `https://github.com/openfilm/openfilm.git`，`upstream/main` |
| fork 推送 | `https://github.com/lsiten/openfilm.git`，`lsiten/main` |

`origin` 在不同克隆中可能是官方地址或 fork；推送显式使用核实过的 `lsiten`。先读 `git remote -v`；仅补齐缺失的命名远端，不擅自覆盖现有不同地址。独立克隆同样可使用此 Skill，不依赖 Easel 一定存在。

## 比较和合并

1. 检查当前分支、跟踪分支、工作区和暂存差异。脏工作区只有在已获提交授权且审阅后才提交，否则保留并报告阻塞；不自动 stash、reset 或清理文件。
2. fetch `upstream` 和 `lsiten`；记录起始 HEAD、两个远端 SHA，查看双方新提交及发布 / 迁移说明。fork 远端若领先本地，先整合这些提交，不覆盖它们。
3. 用 `git merge-base HEAD upstream/main` 建立共同祖先，分别审阅双方从共同祖先起的提交与差异。此子项目曾是浅克隆；缺少祖先时对相关远端 deepen，必要时 unshallow，不能用 unrelated-histories 合并。
4. 创建不重名的 `codex/pre-sync-时间戳` 本地备份分支。子模块初始化后通常处于游离 HEAD：此时先从当前 gitlink SHA 创建 `codex/sync-openfilm-时间戳` 工作分支，不直接切回可能落后的 main。已有工作分支时就在该分支普通 merge；真正分叉时用 `git merge --no-commit --no-ff <已核实的引用>`，审查后提交。已经包含的提交不重复合并，不 rebase 或重写已推送主分支。
5. 对重叠模块列出上游改进、本地改进、融合方案与验证。冲突逐段读取祖先、本地、上游并检查调用方；禁止全文件选 ours/theirs。没有文本冲突也需检查 API、文件路由、构建产物、脚本、锁文件与文档的语义兼容。

同一目标的实现优先选择更可靠、可维护且测试充分的一份，补齐另一份独有能力；缺陷可以被淘汰，不能以“保留双方”为由保留回归。需求本身冲突且无法从现有上下文决定时，说明具体选择再等待用户，不代用户删除能力。

## fork 当前需要保护的能力

先用实际代码确认下列位置仍然有效，路径变化时追踪功能迁移，不能只检查旧文件还在：

| 能力 | 当前实现及兼容点 |
| --- | --- |
| 嵌入式播放器 | `packages/openfilm/src/host.mjs`、`player*.mjs`：`?player=1` 默认暂停，可播放、暂停、拖动进度并同步音频 |
| 预览与宿主分工 | `?film-preview=1` 可独立播放且按视口完整适配；普通宿主、`?film-host=0` 原始文档路径保持既有语义 |
| Studio 项目隔离 | `studio/server/server.mjs` 的 `/open` 重定向保留 `pin=1`；`studio/ui/src/App.tsx` 的 pin 页面忽略其他项目的 open 广播 |
| 时间线与引用 | `ProjectView.tsx` 的 pin 页面默认编辑视角；`studio/ui/src/lib/host.ts` 保留 iframe 引用桥接和桌面原生宿主能力 |
| atelier 与自检 | `manual/atelier/` 的模板、目录和验证器，`MANUAL.md`、编辑技能与技能发现；保留打开帧图实际检查的要求 |

上游的安全修复、渲染恢复、媒体与字幕正确性、平台兼容性同样需要保留。举例：编辑说明冲突时应同时留下本地逐帧看图要求和上游渲染断点续跑规则，而非整段选一方。

`player-audio.mjs` 是生成文件：上游更改 `studio/ui/src/editor/player.ts` 或 `lib/playback-speed.ts` 后，在 `packages/openfilm` 执行 `node src/player-build.mjs`，审阅生成差异并重跑播放器测试；不要手改生成文件或只保留旧产物。检查生成器的导入改写是否仍适配上游结构。

## 验证

先读根及包内的 `package.json` 和当前 CI。复用现有工具与依赖；仅在锁文件或环境确需更新时，使用仓库声明的包管理器版本安装，不为保险升级。可从下列检查开始：

```bash
pnpm typecheck
pnpm --filter openfilm build:ui
node --test packages/openfilm/src/player.test.mjs packages/openfilm/src/skills.test.mjs packages/openfilm/src/host.test.mjs
```

针对本次上游修改增加相应已有回归测试；渲染、时间线、服务端路由或桌面接口变更较广时，运行 `pnpm test`。在相同环境记录同步前已存在的失败，合并后不得通过改断言或跳过用例掩盖新增退化。受影响的播放器 / Studio 需按当前仓库与用户的浏览器规范验证真实行为。

## 与 Easel 一起交付

用 `git rev-parse --show-superproject-working-tree` 判断是否嵌在父仓库；独立克隆没有输出时跳过本节。

若父仓库为 Easel，且本次涉及两者集成：

- 检查 Easel 的 `skills/shared/scripts/openfilm.py` 与 `openfilm_project.py`、`easel/openfilm_studio.py` / `openfilm_references.py` 及 `/api/openfilm/*` 的调用兼容性。
- 在父仓库运行现有的 `tests/test_openfilm_*.py` 与 `node --test tests/frontend/*.test.mjs`，必要时构建 Easel 前端。确认不同会话 / 画像互不串项目、引用与当前视频对应、空会话不加载其他项目。
- 先在子仓库完成提交和已授权的推送，再让父仓库提交指向该 SHA 的 gitlink。父仓库 `.gitmodules` 保持 `https://github.com/lsiten/openfilm.git`；不得把自定义 SHA 交给只有官方代码的 URL。
- 只更新 OpenFilm 的请求不授权自动提交父仓库其他改动；报告父仓库待更新的 gitlink。涉及父仓库同步时读取其 `.agents/skills/easel-upstream-sync/SKILL.md`。

提交前检查完整暂存差异、冲突标记、`git diff --check` 和敏感信息；未完成的合并可用 `git merge --abort` 回到起点，先确认解决冲突过程没有混入新的用户改动。
授权推送后核实 `lsiten` 地址，再显式 `git push lsiten HEAD:main`（用户指定其他分支则遵循指定）。普通 push 被拒绝时 fetch 并融合远端新增提交，不 force push。未解决冲突或同步引入检查失败时停止推送；只要求审阅或本地同步则不推送、不创建 PR。

最后核实实际推送目标的远端 SHA 与提交一致；默认命令为 `git ls-remote lsiten refs/heads/main`，用户指定其他分支时替换该引用。报告采用的上游改进、保留的本地能力、融合决策、测试结果及父仓库 gitlink 状态。
