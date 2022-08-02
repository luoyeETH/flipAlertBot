const config = require("./config");
const whaleAddress = require("./watch_address");
const logWhaleAddress = whaleAddress.map(address => `0x000000000000000000000000${address.slice(2)}`)

const { createAlchemyWeb3 } = require("@alch/alchemy-web3")
const API_URL = `wss://eth-mainnet.alchemyapi.io/v2/${config.alchemyKey}`
const API_URL_HTTPS = `https://eth-mainnet.alchemyapi.io/v2/${config.alchemyKey}`

const web3 = createAlchemyWeb3(API_URL)
const web3_https = createAlchemyWeb3(API_URL_HTTPS)
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
const BARK_URL = `https://api.day.app/${config.barkKey}/`;
const DING_URL = `https://oapi.dingtalk.com/robot/send?access_token=${config.dingdingKey}`;
const BARK_FLAG = config.barkFlag;
const DC_FLAG = config.dcFlag;
const DING_FLAG = config.dingFlag;

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

async function ding(message) {
  if (DING_FLAG) {
    await axios.post(DING_URL, {
        msgtype: "text",
        text: {
            "content": message
        },
    });
  }
}

//获取时间
const getDate = async () => {
  let date = moment(new Date()).utcOffset(8).format('YYYY-MM-DD HH:mm:ss');
  return date
}

// 休眠函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
};

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

// 删除文件指定行
const deleteLine = async (fileName, msg) => {
  let str = path.join(__dirname, fileName);
  fs.readFile(str, 'utf8', function (err, data) {
    if (err) {
      throw new Error("读取文件失败")
    } else {
      let dataArr = data.split('\n');
      dataArr = dataArr.map(item => item.replace(/\r/g, ''));
      let newData = dataArr.filter(item => item !== msg);
      fs.writeFile(str, newData.join('\n'), 'utf8', function (err) {
        if (err) {
          throw new Error("写入文件失败")
        } else {
          console.log("写入文件成功")
        }
      });
    }
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

// 通过openseaKey获取版税
const getTax = async (slug) => {
  const options = {
    method: 'GET',
    url: 'https://api.opensea.io/api/v1/collection/' + slug,
    headers: {'X-API-KEY': openseaKey}
  };
  let response = await axios.request(options).catch(err => {
    console.log(err);
  });
  let jsonData = response.data;
  let tax = jsonData.collection.primary_asset_contracts[0].seller_fee_basis_points;
  tax = (tax / 100).toFixed(2);
  return tax;
}

// 通过openseaKey获取相关链接
const getLinks = async (slug) => {
  const options = {
    method: 'GET',
    url: 'https://api.opensea.io/api/v1/collection/' + slug,
    headers: {'X-API-KEY': openseaKey}
  };
  let response = await axios.request(options).catch(err => {
    console.log(err);
  });
  let jsonData = response.data;
  let discord = jsonData.collection.discord_url;
  let twitter = jsonData.collection.twitter_username;
  twitter = twitter ? `https://twitter.com/${twitter}` : '';
  let website = jsonData.collection.external_url;
  return {discord, twitter, website};
}


// 获取nft余额
const getNftBalance = async (contract) => {
  let nftBalance = 0;
  let child = fork('./checkNFT.js', [contract]);
  console.log('fork return pid: ' + child.pid);
  child.on('message', (msg) => {
    nftBalance = msg;
  });
  child.on('exit', (code) => {
    console.log(`checkNFT child process ${child.pid} exited with ${code}`);
  });
  // 阻塞 等待子进程结束
  await new Promise((resolve) => {
    child.on('exit', resolve);
  }
  );
  return nftBalance;
}


// mint后通知
const mintAlert = async (tx) => {
  // 计算gas
  let res = await web3.eth.getTransactionReceipt(tx.hash)
  let gasUsed = res.gasUsed
  let gasPrice = parseFloat(web3.utils.fromWei(tx.gasPrice, 'ether'))
  let Gwei = parseInt(web3.utils.fromWei(tx.gasPrice, 'Gwei'));
  let gasCost = gasUsed * gasPrice
  // 获取eth价格
  const options = {
    method: 'GET',
    url: 'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD',
  }
  let response = await axios.request(options)
  let ethPrice = response.data.USD
  let gas = (gasCost * ethPrice).toFixed(2)

  // 是否free mint
  let freeMint = false;
  let value = parseFloat(web3.utils.fromWei(tx.value, 'ether'))
  if (value == 0) {
    freeMint = true;
  }

  // 获取os链接
  let slug = await getSlugFromContract(tx.to);
  let openSeaUrl = `https://opensea.io/collection/${slug}`

  // etherscan链接
  let etherscanUrl = `https://etherscan.io/address/${tx.to}/#writeContract`

  // 获取版税  
  let tax = await getTax(slug);
  tax = parseFloat(tax);

  // 获取相关链接
  let links = await getLinks(slug);

  let discord = links.discord;
  let twitter = links.twitter;
  let website = links.website;
  let mintfun = `https://mint.fun/${tx.to}`;

  // 获取单地址nft余额
  let nfts = await web3_https.alchemy.getNfts({owner: tx.from, contractAddresses: [tx.to]});
  let nftCount = nfts.totalCount;

  // 授权价格
  let approveGasUsed = 47000;
  let approveCost = approveGasUsed * gasPrice;
  let approvePrice = (approveCost * ethPrice).toFixed(2);

  // 计算NFT回本价
  let cost = (value + gasCost + approveCost);
  let flipPrice = ((cost / nftCount) / (1 - tax / 100)).toFixed(4);

  // 获取库存前等待
  await sleep(30000);
  let nftBalance = await getNftBalance(tx.to);

  // 推送信息
  let message = `[mint通知] [免费:${freeMint}]\ngas消耗: ${gasCost.toFixed(5)}ETH ${gas}刀 \nmint时: GasPrice: ${Gwei} eth价格: ${ethPrice}\n版税: ${tax}% 授权预估: ${approvePrice}刀 回本价: ${flipPrice}ETH\n总库存: ${nftBalance} 一号${nftCount}个\n\nOpenSea: ${openSeaUrl}\netherscan: ${etherscanUrl}\nMintfun: ${mintfun}\nDiscord: ${discord}\nTwitter: ${twitter}\nWebsite: ${website}`;
  console.log(message);
  await dc(message);
  await bark("mint", message);
  await ding(message);

}


// 初始化os监控程序 适用于断线重连
const initApp = async () => {
  let slugList = await readFromFile('slug.txt');
  if (slugList.length === 0) {
    console.log("slug数组为空");
  } else {
    for (let i = 0; i < slugList.length; i++) {
      let date = await getDate();
      let slug = slugList[i];
      let startMessage = `[flipAlertBot]初始化 \n${date} 开始监控 ${slug}`;
      console.log(startMessage);
      await dc(startMessage);
      await sleep(5000);
      await ding(startMessage);
      await bark("start", startMessage);
      let child = fork('./app.js', [slug]);
      console.log('fork return pid: ' + child.pid);
      child.on('message', (msg) => {
        // 从slug.txt中删除msg所在行
        deleteLine('slug.txt', msg);
      });
      child.on('exit', function (code) {
        console.log(`init child process ${child.pid} exited with code ${code}`);
        console.log(`进程 ${slug}监控 已结束`);
      });
      child.on('error', function (err) {
        console.log('child process error: ' + err);
      });
    }
  }
}

// 开启新的监控程序
const startApp = async (contract) => {
  let slug
  try {
    slug = await getSlugFromContract(contract);
  }
  catch (error) {
    console.log(`error: ${error}`);
    await dc(`[flipAlertBot] \nerror: ${error}`);
    await ding(`error: ${error}`);
    await bark("error", `error: ${error}`);
  }
  await writeToFile('slug.txt', slug + '\n');
  let date = await getDate();
  let startMessage = `[flipAlertBot] \n${date} 开始监控 ${slug} \n合约地址: ${contract}`;
  console.log(startMessage);
  await dc(startMessage);
  await ding(startMessage);
  await bark("start", startMessage);
  let child = fork('./app.js', [slug]);
  console.log('fork return pid: ' + child.pid);
  child.on('message', (msg) => {
    // 从slug.txt中删除msg所在行
    deleteLine('slug.txt', msg);
  })
  child.on('exit', function (code) {
    console.log(`child process ${child.pid} exited with code ${code}`);
  });
}

initApp();

const zeroTopic = "0x0000000000000000000000000000000000000000000000000000000000000000"
const filter = {
  topics: [null, zeroTopic, logWhaleAddress],
}
const setNftContract = (tx) => {
  if(contractHistory.includes(tx.to) === false) {
    contractHistory.push(tx.to);
    startApp(tx.to);
    mintAlert(tx);
  }
}
const doSomethingWithTxn = (txn) => {
  web3.eth.getTransaction(txn.transactionHash).then(setNftContract).catch(console.log)
}

console.log('start subscribe');
web3.eth.subscribe("logs", filter).on("data", doSomethingWithTxn)