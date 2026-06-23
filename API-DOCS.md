# 宠物店会员与预约管理 API 文档

> 服务地址：`http://localhost:3000`
> 基础路径：所有接口以 `/api` 开头
> 数据格式：请求与响应均为 `application/json`
> 字符编码：UTF-8

---

## 一、通用约定

### 1.1 响应格式

所有接口统一返回以下结构：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": { }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | number | HTTP 状态码，2xx 表示成功，4xx 表示客户端错误，5xx 表示服务端错误 |
| `message` | string | 操作结果说明 |
| `data` | object/array/null | 返回的数据，列表类接口为数组 |

### 1.2 鉴权方式

需要登录的接口必须在请求头中携带 JWT：

```
Authorization: Bearer <token>
```

Token 通过 `POST /api/members/register` 或 `POST /api/members/login` 获取，有效期 **7 天**。

### 1.3 错误码速查

| code | 含义 |
|---|---|
| 200 | 成功（GET/PUT/DELETE） |
| 201 | 创建成功（POST） |
| 400 | 参数校验失败 |
| 401 | 未登录 / Token 无效 / Token 过期 |
| 404 | 资源不存在 |
| 409 | 冲突（手机号已注册、库存不足、预约已满等） |
| 500 | 服务器内部错误 |

---

## 二、会员等级与折扣规则

| 等级 | 升级条件 | 权益 |
|---|---|---|
| 普通 | 默认等级 | — |
| 银卡 | 累计消费 ≥ ¥500，自动升级 | — |
| 金卡 | 累计消费 ≥ ¥2000，自动升级 | 全场服务 **8 折** |

> 升级在每次「确认完成预约服务」时触发，积分按消费金额 1:1 累加（向下取整）。

---

## 三、会员模块 `/api/members`

### 3.1 注册会员

- **路径**：`POST /api/members/register`
- **是否鉴权**：否
- **请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `phone` | string | 是 | 手机号，正则 `^1[3-9]\d{9}$` |
| `password` | string | 是 | 密码，至少 6 位 |
| `name` | string | 是 | 会员姓名 |

- **成功响应（201）**：

```json
{
  "code": 201,
  "message": "注册成功",
  "data": {
    "member": {
      "id": 1,
      "phone": "13900001111",
      "name": "张小明",
      "level": "普通",
      "total_consumed": 0,
      "points": 0,
      "created_at": "2026-06-24 10:30:00"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

- **可能错误**：400（参数/手机号格式错误）、409（手机号已注册）

---

### 3.2 登录

- **路径**：`POST /api/members/login`
- **是否鉴权**：否
- **请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `phone` | string | 是 | 手机号 |
| `password` | string | 是 | 密码 |

- **成功响应（200）**：

```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "member": { /* 同 3.1 member 结构 */ },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

- **可能错误**：400（参数为空）、401（手机号或密码错误）

---

### 3.3 获取个人资料

- **路径**：`GET /api/members/profile`
- **是否鉴权**：是
- **请求参数**：无
- **成功响应（200）**：

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "phone": "13900001111",
    "name": "张小明",
    "level": "金卡",
    "total_consumed": 2128,
    "points": 2128,
    "created_at": "2026-06-24 10:30:00"
  }
}
```

---

### 3.4 修改个人资料

- **路径**：`PUT /api/members/profile`
- **是否鉴权**：是
- **请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 新姓名 |

- **成功响应（200）**：同 3.3

---

## 四、宠物档案模块 `/api/pets`

### 4.1 获取宠物列表

- **路径**：`GET /api/pets`
- **是否鉴权**：是
- **请求参数**：无
- **成功响应（200）**：

```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "member_id": 1,
      "name": "小橘",
      "species": "猫",
      "breed": "中华田园猫",
      "age": 2,
      "gender": "公",
      "weight": 4.5,
      "allergies": "青霉素过敏",
      "created_at": "2026-06-24 10:35:00",
      "vaccines": [
        {
          "id": 1,
          "pet_id": 1,
          "vaccine_name": "狂犬疫苗",
          "vaccine_date": "2026-01-15",
          "next_date": "2027-01-15",
          "notes": "无异常"
        }
      ]
    }
  ]
}
```

---

### 4.2 获取宠物详情

- **路径**：`GET /api/pets/:id`
- **是否鉴权**：是
- **路径参数**：`id` — 宠物 ID
- **成功响应（200）**：同 4.1 单条数据

- **可能错误**：404（宠物不存在）

---

### 4.3 创建宠物档案

- **路径**：`POST /api/pets`
- **是否鉴权**：是
- **请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 宠物名称 |
| `species` | string | 是 | 物种（猫/狗/其他） |
| `breed` | string | 否 | 品种 |
| `age` | number | 否 | 年龄（岁） |
| `gender` | string | 否 | 性别（公/母） |
| `weight` | number | 否 | 体重（kg） |
| `allergies` | string | 否 | 过敏信息 |

- **成功响应（201）**：同 4.1 单条数据（`vaccines` 为空数组）

- **可能错误**：400（必填项为空）

---

### 4.4 修改宠物档案

- **路径**：`PUT /api/pets/:id`
- **是否鉴权**：是
- **路径参数**：`id` — 宠物 ID
- **请求参数**：同 4.3
- **成功响应（200）**：同 4.1 单条数据

- **可能错误**：404（宠物不存在）

---

### 4.5 删除宠物档案

- **路径**：`DELETE /api/pets/:id`
- **是否鉴权**：是
- **请求参数**：无
- **成功响应（200）**：

```json
{ "code": 200, "message": "宠物档案删除成功" }
```

---

### 4.6 添加疫苗记录

- **路径**：`POST /api/pets/:id/vaccines`
- **是否鉴权**：是
- **请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `vaccine_name` | string | 是 | 疫苗名称 |
| `vaccine_date` | string | 是 | 接种日期，格式 `YYYY-MM-DD` |
| `next_date` | string | 否 | 下次接种日期 |
| `notes` | string | 否 | 备注 |

- **成功响应（201）**：

```json
{
  "code": 201,
  "message": "疫苗记录添加成功",
  "data": {
    "id": 1,
    "pet_id": 1,
    "vaccine_name": "狂犬疫苗",
    "vaccine_date": "2026-01-15",
    "next_date": "2027-01-15",
    "notes": "无异常"
  }
}
```

---

### 4.7 删除疫苗记录

- **路径**：`DELETE /api/pets/:id/vaccines/:vaccineId`
- **是否鉴权**：是
- **成功响应（200）**：

```json
{ "code": 200, "message": "疫苗记录删除成功" }
```

---

## 五、预约服务模块 `/api/appointments`

### 5.1 服务状态流转

```
待确认 ──(PUT /:id/confirm)──▶ 已完成
   │
   └──(PUT /:id/cancel)──▶ 已取消
```

| 状态 | 说明 | 可执行操作 |
|---|---|---|
| 待确认 | 默认初始状态 | 确认完成 / 取消 |
| 已完成 | 服务已消费，累计到会员等级 | 不可操作 |
| 已取消 | 已取消的预约 | 不可操作 |

---

### 5.2 获取服务项目列表

- **路径**：`GET /api/appointments/services`
- **是否鉴权**：否
- **请求参数**：无
- **成功响应（200）**：

```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "name": "洗澡美容",
      "description": "包含洗浴、吹干、造型修剪",
      "base_price": 128,
      "duration_minutes": 90,
      "capacity_per_slot": 3
    },
    {
      "id": 2,
      "name": "寄养",
      "description": "按天收费，提供舒适环境和定时喂养",
      "base_price": 80,
      "duration_minutes": 1440,
      "capacity_per_slot": 10
    },
    {
      "id": 3,
      "name": "体检",
      "description": "常规健康检查，包含体温、心率、基础血检",
      "base_price": 200,
      "duration_minutes": 60,
      "capacity_per_slot": 2
    }
  ]
}
```

字段说明：
- `base_price`：原价
- `duration_minutes`：单次服务时长，用于自动切分时段
- `capacity_per_slot`：同一时段最大接待量

---

### 5.3 查询某天某服务的剩余名额 ⭐

- **路径**：`GET /api/appointments/availability`
- **是否鉴权**：否
- **Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `service_id` | number | 是 | 服务 ID |
| `date` | string | 是 | 查询日期，格式 `YYYY-MM-DD` |

- **成功响应（200）**：

```json
{
  "code": 200,
  "data": {
    "service": { "id": 1, "name": "洗澡美容", ... },
    "date": "2026-06-24",
    "slots": [
      {
        "start_time": "09:00",
        "end_time": "10:30",
        "capacity": 3,
        "booked": 0,
        "remaining": 3,
        "available": true
      },
      {
        "start_time": "10:30",
        "end_time": "12:00",
        "capacity": 3,
        "booked": 3,
        "remaining": 0,
        "available": false
      }
    ]
  }
}
```

时段自动生成规则：
- 营业时间 09:00–18:00
- 按 `duration_minutes` 自动切分时段（90 分钟 → 09:00–10:30, 10:30–12:00...）
- 「已取消」的预约不计入占用量

- **可能错误**：400（参数/日期格式错误）、404（服务不存在）

---

### 5.4 获取我的预约列表

- **路径**：`GET /api/appointments`
- **是否鉴权**：是
- **成功响应（200）**：

```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "member_id": 1,
      "pet_id": 1,
      "service_id": 1,
      "appointment_date": "2026-06-24",
      "start_time": "09:00",
      "end_time": "10:30",
      "status": "已完成",
      "actual_price": 128,
      "notes": "第一次来请温柔点",
      "created_at": "...",
      "service_name": "洗澡美容",
      "service_description": "...",
      "base_price": 128,
      "duration_minutes": 90,
      "pet_name": "小橘",
      "pet_species": "猫",
      "pet_breed": "中华田园猫"
    }
  ]
}
```

---

### 5.5 获取预约详情

- **路径**：`GET /api/appointments/:id`
- **是否鉴权**：是
- **成功响应（200）**：同 5.4 单条数据（含 `pet_age`、`pet_allergies`）

---

### 5.6 创建预约

- **路径**：`POST /api/appointments`
- **是否鉴权**：是
- **请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `pet_id` | number | 是 | 宠物 ID |
| `service_id` | number | 是 | 服务 ID |
| `appointment_date` | string | 是 | 预约日期，`YYYY-MM-DD` |
| `start_time` | string | 是 | 开始时间，`HH:MM` |
| `notes` | string | 否 | 备注 |

- **自动计算**：
  - `end_time` = `start_time` + `duration_minutes`
  - `actual_price` = 金卡 8 折，其他原价

- **冲突检测**：
  - 必须在 09:00–18:00 营业范围内
  - 同服务同日期同时间段还有剩余容量（`remaining > 0`）

- **成功响应（201）**：同 5.4 单条数据

- **可能错误**：400（参数/格式错误/非营业时间）、404（宠物/服务不存在）、409（时段已满）

---

### 5.7 确认完成服务（触发等级升级 ⭐）

- **路径**：`PUT /api/appointments/:id/confirm`
- **是否鉴权**：是
- **前置条件**：预约状态为「待确认」
- **触发动作**：
  1. 累加 `total_consumed`（实际支付金额）
  2. 累加 `points`（向下取整）
  3. 自动判断并更新会员等级：
     - ≥ ¥2000 → 金卡
     - ≥ ¥500 → 银卡
  4. 预约状态改为「已完成」

- **成功响应（200）**：

```json
{
  "code": 200,
  "message": "服务已确认完成，消费 ¥128，获得 128 积分，恭喜升级为金卡会员！",
  "data": {
    "appointment": { /* 同 5.4 单条数据 */ },
    "member": {
      "id": 1,
      "phone": "13900001111",
      "name": "张小明",
      "level": "金卡",
      "total_consumed": 2128,
      "points": 2128
    }
  }
}
```

- **可能错误**：404（预约不存在）、400（状态不是「待确认」）

---

### 5.8 取消预约

- **路径**：`PUT /api/appointments/:id/cancel`
- **是否鉴权**：是
- **前置条件**：状态为「待确认」（「已完成」和「已取消」都不能再取消）
- **成功响应（200）**：同 5.4 单条数据

---

## 六、借用管理模块 `/api/borrowings`

### 6.1 借用状态流转

```
借用中 ──(超过预计归还日期 + 3 天宽限期，自动触发)──▶ 逾期
   │                                                        │
   └──────────────(PUT /:id/return)────────────────────────┘
                            │
                            ▼
                        已归还
```

| 状态 | 说明 | 可执行操作 |
|---|---|---|
| 借用中 | 正常借用，未到归还日或在宽限期内 | 归还 |
| 逾期 | 超过预计归还日期 + 3 天宽限期仍未还 | 归还（会提示逾期费用） |
| 已归还 | 物品已归还 | 不可操作 |

> 所有借用相关接口在处理前都会自动调用 `refreshOverdue()`，刷新 `借用中`/`逾期` 状态，保证数据实时准确。

---

### 6.2 逾期判定逻辑

```
逾期天数 = max(0, 今天 - 预计归还日期 - 3 天宽限期)
```

举例（今天 = 2026-06-24）：

| 预计归还日 | 距离今天 | 逾期天数 | 状态 |
|---|---|---|---|
| 2026-06-20 | 4 天前 | max(0, 4 - 3) = **1 天** | 逾期 |
| 2026-06-22 | 2 天前 | max(0, 2 - 3) = **0 天** | 借用中（宽限中） |
| 2026-06-25 | 明天 | max(0, -1 - 3) = **0 天** | 借用中 |
| 2026-06-14 | 10 天前 | max(0, 10 - 3) = **7 天** | 逾期 |

每条借用记录附带三个辅助字段：
- `overdue_days`：逾期天数（0 表示未逾期）
- `is_overdue`：`true/false`，是否已逾期
- `grace_remaining`：宽限期剩余天数（仅「借用中」状态有意义）

---

### 6.3 获取可借物品列表

- **路径**：`GET /api/borrowings/items`
- **是否鉴权**：否
- **成功响应（200）**：

```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "name": "宠物航空箱（大号）",
      "description": "适合20kg以内犬猫外出托运",
      "category": "出行用品",
      "total_quantity": 5,
      "available_quantity": 5,
      "deposit": 200,
      "max_borrow_days": 7,
      "created_at": "..."
    }
  ]
}
```

字段说明：
- `deposit`：押金（元）
- `max_borrow_days`：最长可借天数
- `available_quantity`：当前可借数量

---

### 6.4 获取物品详情

- **路径**：`GET /api/borrowings/items/:id`
- **是否鉴权**：否
- **成功响应（200）**：同 6.3 单条数据

---

### 6.5 获取我的借用记录

- **路径**：`GET /api/borrowings`
- **是否鉴权**：是
- **自动动作**：调用前会先 `refreshOverdue()` 刷新状态
- **成功响应（200）**：

```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "member_id": 1,
      "item_id": 1,
      "quantity": 1,
      "borrow_date": "2026-06-10",
      "expected_return_date": "2026-06-17",
      "actual_return_date": null,
      "status": "逾期",
      "overdue_days": 4,
      "notes": "国庆出行用",
      "created_at": "...",
      "item_name": "宠物航空箱（大号）",
      "item_category": "出行用品",
      "item_deposit": 200,
      "member_name": "张小明",
      "member_phone": "13900001111",
      "is_overdue": true,
      "grace_remaining": 0
    }
  ]
}
```

---

### 6.6 获取全部逾期未还记录（按逾期天数倒序 ⭐）

- **路径**：`GET /api/borrowings/overdue`
- **是否鉴权**：是
- **排序规则**：`ORDER BY overdue_days DESC, expected_return_date ASC`
  - 逾期越久排越前
  - 逾期天数相同则预计归还日更早的排前
- **成功响应（200）**：

```json
{
  "code": 200,
  "data": {
    "total": 2,
    "grace_days": 3,
    "records": [
      {
        "id": 2,
        "status": "逾期",
        "overdue_days": 10,
        "item_name": "宠物航空箱（大号）",
        "borrow_date": "2026-06-04",
        "expected_return_date": "2026-06-11",
        ...
      },
      {
        "id": 3,
        "status": "逾期",
        "overdue_days": 5,
        "item_name": "宠物航空箱（小号）",
        "borrow_date": "2026-06-09",
        "expected_return_date": "2026-06-16",
        ...
      }
    ]
  }
}
```

---

### 6.7 获取借用详情

- **路径**：`GET /api/borrowings/:id`
- **是否鉴权**：是
- **成功响应（200）**：同 6.5 单条数据

---

### 6.8 申请借用

- **路径**：`POST /api/borrowings`
- **是否鉴权**：是
- **请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `item_id` | number | 是 | 物品 ID |
| `quantity` | number | 否 | 借用数量，默认 1，必须 ≥ 1 |
| `borrow_days` | number | 否 | 借用天数，不传则用 `max_borrow_days`，超过则自动限制到最大值 |
| `notes` | string | 否 | 备注 |

- **自动计算**：
  - `borrow_date` = 今天
  - `expected_return_date` = 今天 + `borrow_days`
  - 扣减 `items.available_quantity`

- **成功响应（201）**：同 6.5 单条数据

- **可能错误**：400（参数错误）、404（物品不存在）、409（库存不足）

---

### 6.9 归还物品

- **路径**：`PUT /api/borrowings/:id/return`
- **是否鉴权**：是
- **前置条件**：状态为「借用中」或「逾期」（「已归还」不可重复归还）
- **自动动作**：
  1. 重新计算最终逾期天数（基于归还当天）
  2. 状态改为「已归还」，写入 `actual_return_date`
  3. 加回 `items.available_quantity`

- **成功响应（200）**：

```json
// 正常归还
{
  "code": 200,
  "message": "归还成功",
  "data": { /* 借用记录，含 actual_return_date */ }
}

// 逾期归还
{
  "code": 200,
  "message": "归还成功，逾期 8 天，请联系客服处理逾期费用",
  "data": { /* 借用记录 */ }
}
```

- **可能错误**：404（记录不存在）、400（已归还/状态不允许）
