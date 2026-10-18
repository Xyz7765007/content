import { registerHooks } from "node:module";
registerHooks({ resolve(spec, ctx, next) { try { return next(spec, ctx); } catch (e) { if (!/\.\w+$/.test(spec) && !spec.startsWith("node:")) { try { return next(`${spec}.js`, ctx); } catch { /* fall through */ } } throw e; } } });
