const config = require("./config");
const whaleAddress = require("./watch_address");
const logWhaleAddress = whaleAddress.map(address => `0x000000000000000000000000${address.slice(2)}`)

const { createAlchemyWeb3 } = require("@alch/alchemy-web3")
const API_URL = `wss://eth-mainnet.alchemyapi.io/v2/${config.alchemyKey}`
const web3 = createAlchemyWeb3(API_URL)
const { Webhook } = require('discord-webhook-node');
const DC_URL = config.discordKey;
const hook = new Webhook(DC_URL);
const axios = require("axios")
const fork = require('child_process').fork;
const fs = require('fs');
const path = require('path');
const readline  = require('readline');
const moment = require("moment");

const openseaKey = config.openseaKey;
const BARK_URL = `https://api.day.app/${config.barkKey}/`
const BARK_FLAG = config.barkFlag;
const DC_FLAG = config.dcFlag;

let contractHistory = []

// 推送消息
async function bark(title, message) {
  if (BARK_FLAG) {
    const str1 = encodeURI(title);
    const str2 = encodeURI(message);
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

// 写入文件
const writeToFile = async (fileName, data) => {
    let str = path.join(__dirname, fileName);
    fs.appendFile(str, data, 'utf8', function (err) {
        if (err) {
            throw new Error("追加数据失败")
        } else {
            console.log("追加数据成功")
        }
    });
}

// 读取文件
const readFromFile = async (fileName) => { 
    return new Promise((resolve, reject) => {
      let str = path.join(__dirname, fileName);
      let data = [];
      let rl = readline.createInterface({
          input: fs.createReadStream(str)
      });
      rl.on("error", (error) => {
          console.error(error);
          reject(error);
      }
      ).on('line', function (line) {
          data.push(line);
      }
      ).on('close', function () {
          resolve(data)
      });   
    });
}

// 通过openseaKey获取合约地址对应的slug
const getSlugFromContract = async (asset_contract) => {
  const options = {
    method: 'GET',
    url: 'https://api.opensea.io/api/v1/asset_contract/' + asset_contract,
    headers: {'X-API-KEY': openseaKey}
  };
  let response = await axios.request(options)
  let jsonData = response.data;
  let slug = jsonData.collection.slug;
  console.log(slug);
  return slug;
}

// 初始化os监控程序 适用于断线重连
const initApp = async () => {
  let slugList = await readFromFile('slug.txt');
  let contractList = await readFromFile('contract.txt');
  if (slugList.length === 0) {
    console.log("slug数组为空");
    return;
  } else {
    for (let i = 0; i < slugList.length; i++) {
      let date = await getDate();
      let slug = slugList[i];
      let contract = contractList[i];
      let startMessage = `[flipAlertBot] \n${date} 开始监控 ${slug} \n合约地址: ${contract}`;
      console.log(startMessage);
      await dc(startMessage);
      await bark("start", startMessage);
      let child = fork('./app.js', [slug]);
      console.log('fork return pid: ' + child.pid);
    }
  }
}

// 开启新的监控程序
const startApp = async (contract) => {
  await writeToFile('contract.txt', contract + '\n');
  let slug
  try {
    slug = await getSlugFromContract(contract);
  }
  catch (error) {
    console.log(`error: ${error}`);
    await dc(`[flipAlertBot] \nerror: ${error}`);
    await bark("error", `error: ${error}`);
  }

  await writeToFile('slug.txt', slug + '\n');
  let date = await getDate();
  let startMessage = `[flipAlertBot] \n${date} 开始监控 ${slug} \n合约地址: ${contract}`;
  console.log(startMessage);
  await dc(startMessage);
  await bark("start", startMessage);
  let child = fork('./app.js', [slug]);
  console.log('fork return pid: ' + child.pid);
}

initApp();

const zeroTopic = "0x0000000000000000000000000000000000000000000000000000000000000000"
const filter = {
  topics: [null, zeroTopic, logWhaleAddress],
}
const setNftContract = (tx) => {
  if(contractHistory.includes(tx.to) === false) {
    contractHistory.push(tx.to)
    console.log(tx)
    startApp(tx.to);
  }
}
const doSomethingWithTxn = (txn) => {
  web3.eth.getTransaction(txn.transactionHash).then(setNftContract).catch(console.log)
}

console.log('start subscribe');
web3.eth.subscribe("logs", filter).on("data", doSomethingWithTxn)