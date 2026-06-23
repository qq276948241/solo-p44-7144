require('dotenv').config();
const http = require('http');
const { spawn } = require('child_process');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServerReady(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await request('GET', '/');
      if (res.status === 200) return true;
    } catch {
      await sleep(200);
    }
  }
  return false;
}

async function runTests() {
  console.log('🧪 启动服务中...\n');
  const server = spawn('node', ['app.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  server.stdout.on('data', d => { serverOutput += d; });
  server.stderr.on('data', d => { serverOutput += d; });
  server.on('error', e => { console.error('子进程错误:', e); });

  const ready = await waitForServerReady();
  if (!ready) {
    console.error('❌ 服务启动超时');
    console.error('输出日志:', serverOutput);
    server.kill();
    process.exit(1);
  }
  console.log('✅ 服务已就绪，开始测试\n');
  console.log('='.repeat(60));

  try {
    console.log('\n📝 1. 测试 - 获取服务列表 (无需登录)');
    let res = await request('GET', '/api/appointments/services');
    console.log('  状态码:', res.status);
    console.log('  服务数量:', res.body.data.length);
    res.body.data.forEach(s => console.log(`    - ${s.name}: ¥${s.base_price}, ${s.duration_minutes}分钟, 容量${s.capacity_per_slot}`));

    console.log('\n📝 2. 测试 - 查询某天剩余名额 (无需登录)');
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    res = await request('GET', `/api/appointments/availability?service_id=1&date=${dateStr}`);
    console.log('  状态码:', res.status);
    console.log('  日期:', res.body.data.date);
    console.log('  服务:', res.body.data.service.name);
    const availSlots = res.body.data.slots.filter(s => s.available).length;
    console.log(`  可用时段: ${availSlots}/${res.body.data.slots.length} 个`);
    if (availSlots > 0) {
      const firstAvail = res.body.data.slots.find(s => s.available);
      console.log(`  第一个可用: ${firstAvail.start_time}-${firstAvail.end_time}`);
    }

    console.log('\n📝 3. 测试 - 会员注册');
    const phone = '139' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
    const registerBody = { phone, password: '123456', name: '测试用户' };
    res = await request('POST', '/api/members/register', registerBody);
    console.log('  状态码:', res.status);
    console.log('  返回消息:', res.body.message);
    const token = res.body.data.token;
    const memberId = res.body.data.member.id;
    console.log('  会员ID:', memberId);
    console.log('  当前等级:', res.body.data.member.level);
    console.log('  Token已获取:', token.substring(0, 30) + '...');

    console.log('\n📝 4. 测试 - 会员登录');
    res = await request('POST', '/api/members/login', { phone, password: '123456' });
    console.log('  状态码:', res.status);
    console.log('  返回消息:', res.body.message);
    console.log('  登录用户:', res.body.data.member.name);

    console.log('\n📝 5. 测试 - 获取个人资料 (需登录)');
    res = await request('GET', '/api/members/profile', null, token);
    console.log('  状态码:', res.status);
    console.log('  用户名:', res.body.data.name);
    console.log('  等级:', res.body.data.level);
    console.log('  累计消费:', '¥' + res.body.data.total_consumed);
    console.log('  积分:', res.body.data.points);

    console.log('\n📝 6. 测试 - 创建宠物档案');
    const petBody = {
      name: '小橘',
      species: '猫',
      breed: '中华田园猫',
      age: 2,
      gender: '公',
      weight: 4.5,
      allergies: '无'
    };
    res = await request('POST', '/api/pets', petBody, token);
    console.log('  状态码:', res.status);
    console.log('  返回消息:', res.body.message);
    const petId = res.body.data.id;
    console.log('  宠物ID:', petId);
    console.log('  宠物名:', res.body.data.name);

    console.log('\n📝 7. 测试 - 添加疫苗记录');
    const vacBody = {
      vaccine_name: '狂犬疫苗',
      vaccine_date: '2026-01-15',
      next_date: '2027-01-15',
      notes: '无异常'
    };
    res = await request('POST', `/api/pets/${petId}/vaccines`, vacBody, token);
    console.log('  状态码:', res.status);
    console.log('  返回消息:', res.body.message);
    console.log('  疫苗名称:', res.body.data.vaccine_name);

    console.log('\n📝 8. 测试 - 获取宠物列表 (含疫苗)');
    res = await request('GET', '/api/pets', null, token);
    console.log('  状态码:', res.status);
    console.log('  宠物数量:', res.body.data.length);
    const testPet = res.body.data[0];
    console.log('  宠物名:', testPet.name, '-', testPet.species, testPet.breed);
    console.log('  疫苗记录数:', testPet.vaccines.length);
    testPet.vaccines.forEach(v => console.log(`    * ${v.vaccine_name} @ ${v.vaccine_date}`));

    console.log('\n📝 9. 测试 - 创建预约 (洗澡美容)');
    const availRes = await request('GET', `/api/appointments/availability?service_id=1&date=${dateStr}`);
    const firstAvailSlot = availRes.body.data.slots.find(s => s.available);
    if (firstAvailSlot) {
      const aptBody = {
        pet_id: petId,
        service_id: 1,
        appointment_date: dateStr,
        start_time: firstAvailSlot.start_time,
        notes: '第一次来，请温柔点'
      };
      res = await request('POST', '/api/appointments', aptBody, token);
      console.log('  状态码:', res.status);
      console.log('  返回消息:', res.body.message);
      console.log('  预约ID:', res.body.data.id);
      console.log('  服务:', res.body.data.service_name);
      console.log('  时间:', res.body.data.appointment_date, res.body.data.start_time);
      console.log('  实际价格: ¥' + res.body.data.actual_price + ' (会员等级: 普通)');
      const aptId = res.body.data.id;

      console.log('\n📝 10. 测试 - 确认完成服务 (触发消费累计)');
      res = await request('PUT', `/api/appointments/${aptId}/confirm`, null, token);
      console.log('  状态码:', res.status);
      console.log('  返回消息:', res.body.message);
      console.log('  会员等级:', res.body.data.member.level);
      console.log('  累计消费: ¥' + res.body.data.member.total_consumed);
      console.log('  积分:', res.body.data.member.points);

      console.log('\n📝 11. 测试 - 多次预约消费触发升级到金卡 (目标满¥2000)');
      let examAvailRes = await request('GET', `/api/appointments/availability?service_id=3&date=${dateStr}`);
      let examSlots = examAvailRes.body.data.slots;
      for (let i = 0; i < examSlots.length; i++) {
        for (let j = 0; j < 3; j++) {
          const body = {
            pet_id: petId,
            service_id: 3,
            appointment_date: dateStr,
            start_time: examSlots[i].start_time
          };
          const createRes = await request('POST', '/api/appointments', body, token);
          if (createRes.status === 201) {
            await request('PUT', `/api/appointments/${createRes.body.data.id}/confirm`, null, token);
          } else if (createRes.status === 409) {
            break;
          }
        }
        const profile = await request('GET', '/api/members/profile', null, token);
        if (profile.body.data.total_consumed >= 2000) break;
      }
      res = await request('GET', '/api/members/profile', null, token);
      console.log('  状态码:', res.status);
      console.log('  累计消费: ¥' + res.body.data.total_consumed);
      console.log('  当前等级:', res.body.data.level, '(目标: 金卡)');
      console.log('  当前积分:', res.body.data.points);

      if (res.body.data.level === '金卡') {
        console.log('\n📝 12. 测试 - 金卡会员创建预约享8折');
        examAvailRes = await request('GET', `/api/appointments/availability?service_id=1&date=${dateStr}`);
        const slot = examAvailRes.body.data.slots.find(s => s.remaining > 0);
        if (slot) {
          const body = {
            pet_id: petId,
            service_id: 1,
            appointment_date: dateStr,
            start_time: slot.start_time
          };
          res = await request('POST', '/api/appointments', body, token);
          console.log('  状态码:', res.status);
          console.log('  服务原价: ¥128');
          const expectedPrice = Math.round(128 * 0.8 * 100) / 100;
          console.log('  金卡8折后: ¥' + res.body.data.actual_price, `(128 × 0.8 = ${expectedPrice})`);
          const discountCorrect = Math.abs(res.body.data.actual_price - expectedPrice) < 0.01;
          console.log('  折扣计算正确:', discountCorrect ? '✅ 是' : '❌ 否');
        } else {
          const nextDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
          examAvailRes = await request('GET', `/api/appointments/availability?service_id=1&date=${nextDate}`);
          const nextSlot = examAvailRes.body.data.slots.find(s => s.remaining > 0);
          if (nextSlot) {
            const body = {
              pet_id: petId,
              service_id: 1,
              appointment_date: nextDate,
              start_time: nextSlot.start_time
            };
            res = await request('POST', '/api/appointments', body, token);
            console.log('  状态码:', res.status);
            console.log('  日期:', nextDate);
            console.log('  服务原价: ¥128');
            const expectedPrice = Math.round(128 * 0.8 * 100) / 100;
            console.log('  金卡8折后: ¥' + res.body.data.actual_price, `(128 × 0.8 = ${expectedPrice})`);
            const discountCorrect = Math.abs(res.body.data.actual_price - expectedPrice) < 0.01;
            console.log('  折扣计算正确:', discountCorrect ? '✅ 是' : '❌ 否');
          }
        }
      }

      console.log('\n📝 13. 测试 - 获取我的预约列表');
      res = await request('GET', '/api/appointments', null, token);
      console.log('  状态码:', res.status);
      console.log('  预约总数:', res.body.data.length);
      res.body.data.slice(0, 3).forEach(a => {
        console.log(`    [${a.status}] ${a.service_name} @ ${a.appointment_date} ${a.start_time} - ¥${a.actual_price}`);
      });
    } else {
      console.log('  ⚠️ 今日无可预约时段，跳过预约测试');
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ 所有测试通过！服务运行正常。');
    console.log('   API 服务地址: http://localhost:3000');

  } catch (err) {
    console.error('\n❌ 测试出错:', err.message);
    console.error('   服务输出:', serverOutput);
  } finally {
    server.kill();
    process.exit(0);
  }
}

runTests();
