require('dotenv').config();
const express = require('express');
const cors = require('cors');

require('./config/database');

const { router: memberRoutes } = require('./routes/members');
const petRoutes = require('./routes/pets');
const appointmentRoutes = require('./routes/appointments');
const { router: borrowingRoutes } = require('./routes/borrowings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    code: 200,
    message: '宠物店会员与预约管理 API 服务已启动',
    endpoints: {
      '会员模块': {
        'POST /api/members/register': '会员注册',
        'POST /api/members/login': '会员登录',
        'GET /api/members/profile': '获取个人资料（需登录）',
        'PUT /api/members/profile': '更新个人资料（需登录）'
      },
      '宠物档案模块': {
        'GET /api/pets': '获取宠物列表（需登录）',
        'GET /api/pets/:id': '获取宠物详情（需登录）',
        'POST /api/pets': '创建宠物档案（需登录）',
        'PUT /api/pets/:id': '更新宠物档案（需登录）',
        'DELETE /api/pets/:id': '删除宠物档案（需登录）',
        'POST /api/pets/:id/vaccines': '添加疫苗记录（需登录）',
        'DELETE /api/pets/:id/vaccines/:vaccineId': '删除疫苗记录（需登录）'
      },
      '预约服务模块': {
        'GET /api/appointments/services': '获取服务项目列表',
        'GET /api/appointments/availability?service_id=&date=': '查询某天某服务剩余名额',
        'GET /api/appointments': '获取我的预约列表（需登录）',
        'GET /api/appointments/:id': '获取预约详情（需登录）',
        'POST /api/appointments': '创建预约（需登录）',
        'PUT /api/appointments/:id/confirm': '确认完成服务（需登录，累计消费升级）',
        'PUT /api/appointments/:id/cancel': '取消预约（需登录）'
      },
      '借用管理模块': {
        'GET /api/borrowings/items': '获取可借物品列表',
        'GET /api/borrowings/items/:id': '获取物品详情',
        'GET /api/borrowings': '获取我的借用记录（需登录）',
        'GET /api/borrowings/overdue': '获取全部逾期未还记录，按逾期天数倒序（需登录）',
        'GET /api/borrowings/:id': '获取借用详情（需登录）',
        'POST /api/borrowings': '申请借用（需登录，扣库存+自动算预计归还日）',
        'PUT /api/borrowings/:id/return': '归还物品（需登录，加回库存+记录实际归还日）'
      }
    },
    '会员等级规则': {
      '普通会员': '默认等级',
      '银卡会员': '累计消费满 500 元自动升级',
      '金卡会员': '累计消费满 2000 元自动升级，全场 8 折'
    },
    '借用逾期规则': {
      '宽限期': '预计归还日期后 3 天内不算逾期',
      '逾期判定': '超过预计归还日期 3 天以上自动标记为「逾期」',
      '逾期列表': '按逾期天数从大到小倒序排列'
    }
  });
});

app.use('/api/members', memberRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/borrowings', borrowingRoutes);

app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在'
  });
});

app.use((err, req, res, next) => {
  console.error('未捕获的错误:', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误'
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 宠物店 API 服务已启动`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`\n📋 快速测试接口:`);
  console.log(`   GET  http://localhost:${PORT}/                           # API 首页`);
  console.log(`   GET  http://localhost:${PORT}/api/appointments/services  # 服务列表`);
  console.log(`   POST http://localhost:${PORT}/api/members/register       # 注册会员`);
  console.log(`\n`);
});
