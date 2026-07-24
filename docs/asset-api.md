# MotionFrame 素材 API v1

前端通过该接口管理 NAS 上的图片和视频。项目 JSON 只保存 `assetId` 和素材元数据；素材二进制保存在 NAS，浏览器使用 IndexedDB 缓存。

## 基础约定

- Base URL 示例：`https://nas.example.com`
- API 前缀：`/api/v1`
- 请求和响应使用 UTF-8。
- JSON 接口返回数据本体，或 `{ "data": ... }`，前端两种格式都支持。
- 可选鉴权：`Authorization: Bearer <token>`。
- GitHub Pages 是 HTTPS，NAS 接口也必须提供 HTTPS；HTTP 接口会被浏览器作为 mixed content 拦截。
- 必须允许编辑器域名的 CORS 请求。

建议响应头：

```http
Access-Control-Allow-Origin: https://baozi510.github.io
Access-Control-Allow-Methods: GET,POST,DELETE,OPTIONS
Access-Control-Allow-Headers: Authorization,Content-Type
```

## 数据结构

### AssetFolder

```json
{
  "id": "folder_123",
  "name": "产品素材",
  "parentId": null,
  "createdAt": "2026-07-24T12:00:00Z"
}
```

### ProjectAsset

```json
{
  "id": "asset_123",
  "type": "image",
  "name": "产品主图.png",
  "mimeType": "image/png",
  "size": 8245120,
  "width": 3000,
  "height": 4000,
  "duration": null,
  "hash": "sha256:...",
  "folderId": "folder_123",
  "downloadUrl": "https://nas.example.com/api/v1/assets/asset_123/content",
  "thumbnailUrl": "https://nas.example.com/api/v1/assets/asset_123/thumbnail",
  "createdAt": "2026-07-24T12:00:00Z"
}
```

视频素材的 `type` 为 `video`，并返回秒数形式的 `duration`。`downloadUrl` 和 `thumbnailUrl` 可以是公开 URL、短期签名 URL或同域 API URL。项目 JSON 不依赖它们永久不变，核心标识是 `id`。

## 文件夹接口

### 获取根目录文件夹

```http
GET /api/v1/folders
```

### 获取某文件夹的子文件夹

```http
GET /api/v1/folders?parentId=folder_123
```

响应：

```json
[
  {
    "id": "folder_456",
    "name": "详情页",
    "parentId": "folder_123"
  }
]
```

### 新建文件夹

```http
POST /api/v1/folders
Content-Type: application/json
```

```json
{
  "name": "产品素材",
  "parentId": null
}
```

响应为创建后的 `AssetFolder`。

## 素材接口

### 获取素材列表

获取全部素材：

```http
GET /api/v1/assets
```

获取文件夹内素材：

```http
GET /api/v1/assets?folderId=folder_123
```

第一版直接返回数组即可。素材很多时可扩展为：

```json
{
  "items": [],
  "nextCursor": null
}
```

当前前端暂未使用分页。

### 上传图片或视频

```http
POST /api/v1/assets
Content-Type: multipart/form-data
```

字段：

- `file`：必填，原始文件。
- `folderId`：可选。

响应为完整 `ProjectAsset`。服务端应当：

1. 生成不可冲突的 `assetId`。
2. 流式写入 NAS，不要一次性把大视频读入内存。
3. 计算文件大小、MIME、hash。
4. 读取图片宽高；读取视频宽高和时长。
5. 可选生成图片/视频缩略图。
6. 限制允许的 MIME 和最大文件大小。

### 获取单个素材信息

```http
GET /api/v1/assets/asset_123
```

响应为 `ProjectAsset`。

### 下载素材原文件

```http
GET /api/v1/assets/asset_123/content
```

要求：

- 返回原始二进制。
- 正确设置 `Content-Type`、`Content-Length`、`ETag`。
- 建议支持 `Range` 请求，便于大视频和后续断点续传。
- 允许 CORS。

### 获取缩略图（推荐）

```http
GET /api/v1/assets/asset_123/thumbnail
```

返回 JPEG/WebP 缩略图。该地址最好无需自定义请求头，或返回短期签名 URL，因为浏览器 `<img>` 标签不能附加 Bearer Token。

### 删除素材

```http
DELETE /api/v1/assets/asset_123
```

成功可返回 `204 No Content`。

## 前端工作流程

### 上传

1. 前端向 `POST /api/v1/assets` 上传图片或视频。
2. API 返回 `ProjectAsset`。
3. 前端直接把用户选中的原文件 Blob 写入 IndexedDB，不再重新下载。
4. 项目和元素只保存 `assetId` 与元数据，不保存 Base64。

### 打开项目

1. 读取 JSON 中的 `assetId`。
2. 查询 IndexedDB。
3. 本地有且 hash 一致：直接创建 Blob URL。
4. 本地没有或 hash 不一致：调用 `/content` 下载并缓存。
5. 远程也不存在：提示具体缺失素材。

### 导出

1. 导出器加载当前场景使用的所有素材。
2. 图片和视频都优先从 IndexedDB 读取。
3. 缺失素材先从 NAS 下载完成。
4. 全部素材准备完成后才逐帧渲染。
5. 视频当前仅作为画面轨道参与导出，不提取或混入视频音频。

## 推荐 NAS 文件布局

```text
/data/motionframe/
├── originals/
│   └── asset_123.png
├── thumbnails/
│   └── asset_123.webp
└── metadata.sqlite
```

元数据可使用 SQLite，文件二进制直接保存在文件系统。不要把大文件存进 SQLite BLOB。
