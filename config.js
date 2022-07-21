module.exports = {
    alchemyKey: "",  // alchemy提供的ApiKey
    openseaKey: "", // opensea提供的ApiKey
    discordKey: "", // 推送到discord
    barkKey: "",  // 推送到bark
    dingdingKey: "", // 推送到钉钉
    alertPrice: 0.005, // 首次提醒价格
    gearsPrice: 0.005, // 阶梯提醒价格档位
    reactivatePrice: 0.005, // 触发复活提醒价格
    barkFlag: false, // 是否推送到bark
    dcFlag: false, // 是否推送到discord
    dingFlag: false, // 是否推送到钉钉
    publicKey: [
        "0x0000000000000000000000000000000000000000", // 要查询NFT库存的账户列表
        "0x1111111111111111111111111111111111111111", 
    ],

}