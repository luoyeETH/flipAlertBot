const config = require("./config");
const openseaKey = config.openseaKey;
const DC_URL = config.discordKey;
const {OpenSeaStreamClient, EventType} = require('@opensea/stream-js');
const {WebSocket} = require('ws')
const web3 = require('web3')
const moment = require("moment")
const { Webhook } = require('discord-webhook-node');
const hook = new Webhook(DC_URL)
const axios = require("axios")
const BARK_URL = `https://api.day.app/${config.barkKey}/`
const BARK_FLAG = config.barkFlag;
const DC_FLAG = config.dcFlag;

global.lastFivePriceList = []
global.lastAlertDate = 0
global.alertTimes = 0
global.reactivateAlertTimes = 0
global.alertPrice = config.alertPrice;
global.gearsPrice = config.gearsPrice;
global.reactivatePrice = config.reactivatePrice;

async function bark(title, message) {
  if (BARK_FLAG) {
    const str1 =encodeURI(title);
    const str2 =encodeURI(message);
    await axios.get(`${BARK_URL}${str1}/${str2}`)
  }
}
async function dc(message) {
  if (DC_FLAG) {
    await hook.send(message);
  }
}

//获取时间
const getDate = async () => {
  let date = moment(new Date()).utcOffset(8).format('YYYY-MM-DD HH:mm:ss');
  return date
}

//计算时间差
const getTimeDiff = async (startTime, endTime) => {
  let start = moment(startTime, "YYYY-MM-DD HH:mm:ss");
  let end = moment(endTime, "YYYY-MM-DD HH:mm:ss");
  let diff = start.diff(end, 'seconds')
  return diff
}

const getSlugFromArgs = async (args) => {
  args = process.argv.slice(2);
  let slug = args[0];
  return slug;
}

const getAlertPriceFromArgs = async (args) => {
  args = process.argv.slice(2);
  let alertPrice = args[1];
  return alertPrice;
}


const osSellEvent = async (slug) => {
  const client = new OpenSeaStreamClient({
      token: openseaKey,
      connectOptions: {
      transport: WebSocket,
  },
  });


  async function handleList(event) {

    console.log('\x1b[36m%s\x1b[0m',`List: ${event.payload.item.metadata.name}  ${web3.utils.fromWei(event.payload.base_price)}ETH`)

  }

  async function handleSold(event) {

    console.log('\x1b[33m%s\x1b[0m', `Sell: ${event.payload.item.metadata.name}  ${web3.utils.fromWei(event.payload.sale_price)}ETH`)
    let price = web3.utils.fromWei(event.payload.sale_price)
    // 强制转换为浮点数
    price = parseFloat(price)
    lastFivePriceList.push(price)
    // 计算最后五次price平均值
    if (lastFivePriceList.length > 5) {
      lastFivePriceList.shift()
    }
    
    // 去除最高价计算平均价格 精确到四位小数
    if (lastFivePriceList.length == 5) {
      let newLastFivePriceList = lastFivePriceList.slice(0)
      newLastFivePriceList.sort(function(a, b){return a-b})

      let sum = 0
      for (let i = 0; i < 3; i++) {
        sum += newLastFivePriceList[i]
        console.log(`${i+1} ${newLastFivePriceList[i]}`)
      }

      let avgPrice = (sum / 3).toFixed(4)
      console.log(`\x1b[32m%s\x1b[0m`, `Avg: ${avgPrice}ETH`)
      // 判断均价是否超过预定值 
      let now = await getDate()
      let diff_time = await getTimeDiff(now, lastAlertDate)
      console.log(`diff:${diff_time}---avgPrice:${avgPrice}---alertPrice:${alertPrice}`)

      if (avgPrice > alertPrice && diff_time >= 60) {
        lastAlertDate = await getDate();
        let gears = parseInt(alertTimes / 3) + 1;
        alertPrice = (gears * gearsPrice).toFixed(4);
        console.log(`\x1b[32m%s\x1b[0m`, `AlertPrice: ${alertPrice}ETH`);
        alertTimes += 1
        let message = `[flipAlertBot] \n第${alertTimes}次预警 \n${slug}的成交均价${avgPrice}ETH触发第${gears}档预警 \n最近五笔成交\n${lastFivePriceList[0]}ETH \n${lastFivePriceList[1]}ETH \n${lastFivePriceList[2]}ETH \n${lastFivePriceList[3]}ETH \n${lastFivePriceList[4]}ETH`
        console.log(message);
        await bark("flipAlertBot", `${avgPrice}ETH`)
        await dc(message);        
      } 
      else if (avgPrice > reactivatePrice && diff_time > 14400) {
        reactivateAlertTimes += 1
        if (reactivateAlertTimes >= 5) {
          global.lastAlertDate = await getDate();
          let message = `[flipAlertBot] \n复活预警 \n${slug}最近五笔成交均价为${avgPrice}ETH \n${lastFivePriceList[0]}ETH \n${lastFivePriceList[1]}ETH \n${lastFivePriceList[2]}ETH \n${lastFivePriceList[3]}ETH \n${lastFivePriceList[4]}ETH`
          console.log(message);
          await dc(message);
          await bark("flipAlertBot", `${slug} ${avgPrice}ETH`)         
        }
      }
    } 
  }

  client.onEvents(
      slug,
      [EventType.ITEM_LISTED, EventType.ITEM_SOLD],
      (event) => {
        // handle event
        if (event.event_type === 'item_listed') {
          handleList(event);
        }
        else if (event.event_type === 'item_sold') {
          handleSold(event, alertPrice);
        }
      }
    );
}

const main = async () => {
  let slug
  // 手动启动 node app.js <slug> <alertPrice>
  if (process.argv.length == 4) {
    slug = await getSlugFromArgs();
    alertPrice = await getAlertPriceFromArgs();
  } else {
    slug = await getSlugFromArgs();
  }
  await osSellEvent(slug);
}

main();