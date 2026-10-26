// 首次启动建索引（docker-entrypoint-initdb.d 自动执行）
const db = db.getSiblingDB('aiwrite')

// 项目列表按更新时间
db.projects.createIndex({ userId: 1, updatedAt: -1 })
// 分叉挂靠查询
db.projects.createIndex({ parentId: 1 })
// 版本台账唯一（内容不可变凭证）
db.project_versions.createIndex({ projectId: 1, version: 1 }, { unique: true })
// 设备登记唯一
db.devices.createIndex({ userId: 1, deviceKey: 1 }, { unique: true })

print('ai-write indexes created')
