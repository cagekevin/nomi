# electron/vendor

厂商 HTTP 传输与溯源（通用底座，被 `catalog/` 各厂商复用）。

- `vendorHttp.ts`：厂商 HTTP 通用客户端（含重试/超时）。
- `vendorBaseFallback.ts` / `vendorBaseFallbackBoot.ts`：厂商基础兜底与启动兜底。
- `fingerprintCache.ts`：厂商指纹缓存。
- `provenance.ts`：溯源（模型/请求来源标记）。
