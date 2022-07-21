const config = require("./config")

const API_URL = `https://eth-mainnet.alchemyapi.io/v2/${config.alchemyKey}`
const PUBLIC_KEY_LIST = config.publicKey

const {createAlchemyWeb3} = require("@alch/alchemy-web3")
const web3 = createAlchemyWeb3(API_URL)

const moment = require("moment");

// 获取时间
const getDate = () => {
  let date = moment(new Date()).utcOffset(8).format('YYYY-MM-DD HH:mm:ss.SSS');
  return date
}

// 初始化
let date = getDate()
console.log(`\n${date} 开始检查NFT余额...\n`)

//获取单地址NFT余额
async function getNFTBalance(contract, address) {
  const nfts = await web3.alchemy.getNfts({owner: address, contractAddresses: contract})
  if (nfts.totalCount == 0) {
    return nfts.totalCount
  }
  console.log("\nnumber of NFTs found:", nfts.totalCount);
  for (const nft of nfts.ownedNfts) {
    // 16进制转10进制
    let tokenIdDec = parseInt(nft.id.tokenId, 16)  
    console.log("token ID:", tokenIdDec);
  }
  let addressNftBalance = nfts.totalCount
  return addressNftBalance
}

// 循环获取所有地址的NFT余额
const getAllNFTBalance = async (contract) => {
  let allNftBalance = 0
  for (let i = 0; i < PUBLIC_KEY_LIST.length; i++) {
    let address = PUBLIC_KEY_LIST[i]
    contract = [contract]
    let nftBalance = await getNFTBalance(contract, address)
    if (nftBalance !== 0) {
      console.log(`${address} NFT balance: ${nftBalance}`)   
      allNftBalance += nftBalance
    }
  }
  console.log(`NFT ${contract} \nALL Address balance: ${allNftBalance}`) 
  return allNftBalance
}

const startRun = async () => {
  
  args = process.argv.slice(2);
  let contractAddress = args[0];
  let allNftBalance = 0;
  allNftBalance = await getAllNFTBalance(contractAddress);  
  process.send(allNftBalance);
}

startRun()