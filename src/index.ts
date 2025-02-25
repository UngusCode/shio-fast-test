import { SuiClient, SuiTransactionBlockResponse } from "@mysten/sui/client"
import { Transaction } from "@mysten/sui/transactions"
import { SUI_CLOCK_OBJECT_ID, SUI_TYPE_ARG } from "@mysten/sui/utils"
import { Keypair } from '@mysten/sui/cryptography';

import { EstimateFee, ExecuteTransactionBlock, ExecuteBundle, AppendCoinToTip, ShioFastRpcUrl } from "shio-fast-sdk";
import { normal_wallet, shio_wallet } from "./wallet.js";
import ts from "typescript";
// pool info
const CETUS_SUI_USDC_POOL_ID = "0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105"
const USDC_MINT = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"
const CETUS_CONFIG = "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f";
const PARTNER_ID = "0xeb863165a109f7791a3182be08aff1438ab2a429314fc135ae19d953afe1edd6"
//replace with your own node url if not local
const NODE_URL = "https://fullnode.mainnet.sui.io:443"
const NUMBER_OF_TRANSACTIONS = 50
const SHIO_GAS_PRICE = 6000

// Add this line after the imports to check the URL
console.log("Shio Fast RPC URL:", ShioFastRpcUrl);

async function estimateGas(client: SuiClient,tx:Transaction):Promise<number> {
    let bytes = await tx.build({client})
    let dryrunres = await client.dryRunTransactionBlock({
         transactionBlock: bytes
       
    });
    let gasSummary = dryrunres.effects.gasUsed
    let totalGas = Number(gasSummary.computationCost) + Number(gasSummary.storageCost)-Number(gasSummary.storageRebate)+Number(gasSummary.nonRefundableStorageFee)
    return totalGas


}
async function createNormalSwapTx(client: SuiClient,wallet:Keypair,shiototalgas:number):Promise<Transaction> {
    const tx = new Transaction()
    tx.setSender(wallet.getPublicKey().toSuiAddress())

    const coin = tx.splitCoins(tx.gas, [1_000_000])
    const usdccoin = tx.moveCall({
        package: "0xeffc8ae61f439bb34c9b905ff8f29ec56873dcedf81c7123ff2f1f67c45ec302",
        module: "cetus",
        function: "swap_b2a",
        arguments: [
            tx.object(CETUS_CONFIG)
            ,tx.object(CETUS_SUI_USDC_POOL_ID),
            tx.object(PARTNER_ID),
            coin,
            tx.object(SUI_CLOCK_OBJECT_ID),
        ],
        typeArguments: [USDC_MINT, SUI_TYPE_ARG]
    })
    tx.transferObjects([usdccoin], wallet.toSuiAddress())
    // sim with shio gas price first and scale accordingly
    tx.setGasPrice(SHIO_GAS_PRICE)
    let estimatedGas = await estimateGas(client,tx)
    // tip is 5% of estimated gas fee so 21* should be the total fee (network fee + tip)

    let gasmulitplier = shiototalgas/estimatedGas
    // console.log(`Estimated gas is ${estimatedGas} and shio total fee is ${shiototalgas} so gas multiplier is ${gasmulitplier}`)


    // gas to use to make fee on normal tx and shio tx equal
    let normalGasPrice = Math.floor(SHIO_GAS_PRICE*gasmulitplier)
    tx.setGasPrice(normalGasPrice)


    
    tx.setGasBudget(estimatedGas*2)


    
    return tx
}
interface EstimatedFee {
    gasPrice: number;
    gasBudget: number;
    tipAmount: number;
}

async function createShioSwapTx(client: SuiClient,wallet:Keypair):Promise<{tx:Transaction,estimatedFee:EstimatedFee}> {
    const tx = new Transaction()
    tx.setSender(wallet.getPublicKey().toSuiAddress())
    const coin = tx.splitCoins(tx.gas, [1_000_000])
    const usdccoin = tx.moveCall({
        package: "0xeffc8ae61f439bb34c9b905ff8f29ec56873dcedf81c7123ff2f1f67c45ec302",
        module: "cetus",
        function: "swap_b2a",
        arguments: [
            tx.object(CETUS_CONFIG)
            ,tx.object(CETUS_SUI_USDC_POOL_ID),
            tx.object(PARTNER_ID),
            coin,
            tx.object(SUI_CLOCK_OBJECT_ID),
        ],
        typeArguments: [USDC_MINT, SUI_TYPE_ARG]
    })
  

    tx.transferObjects([usdccoin], wallet.getPublicKey().toSuiAddress())
    let estimatedFee = await EstimateFee({
        transaction: tx,
        client: client,
      });
    tx.setGasPrice(SHIO_GAS_PRICE)
    tx.setGasBudget(estimatedFee.gasBudget)
    let tipCoin = tx.splitCoins(tx.gas, [estimatedFee.tipAmount]);
    AppendCoinToTip(tx, tipCoin, estimatedFee.tipAmount);

    
    return {tx,estimatedFee}
}

async function main() {
    const localClient = new SuiClient({url: NODE_URL})
    const shioClient = new SuiClient({url: ShioFastRpcUrl})

    try{
        await localClient.getLatestCheckpointSequenceNumber()
        console.log(`Successfully connected to ${NODE_URL} node`)
    }catch(e){
        console.log(`Error connecting to ${NODE_URL} node`)
        console.log(e)
        return
    }
    
    // Add tracking variables
    let shioFasterCount = 0;
    let normalFasterCount = 0;

    
    // Test both connections
 
    // check atleast 3 sui in each wallet
    let normalBalance = await localClient.getBalance({owner:normal_wallet.toSuiAddress()})
    let shioBalance = await localClient.getBalance({owner:shio_wallet.toSuiAddress()})
    if(Number(normalBalance.totalBalance) < 1_000_000_000){
        throw new Error("Not enough sui in normal wallet")
    }
    if(Number(shioBalance.totalBalance) < 1_000_000_000){
        throw new Error("Not enough sui in shio wallet")
    }

    

    for (let i = 0; i < NUMBER_OF_TRANSACTIONS; i++) {
        const shiores = await createShioSwapTx(shioClient, shio_wallet)
        let estimatedFee = shiores.estimatedFee
        let shioTx = shiores.tx
        let estimatedGas = await estimateGas(shioClient,shioTx)

        let normalTx = await createNormalSwapTx(localClient, normal_wallet,estimatedFee.tipAmount+estimatedGas)

        
        let Normalsig = await normalTx.sign({client:localClient,signer:normal_wallet})
        let Shiosig = await shioTx.sign({client:localClient,signer:shio_wallet})
        
        

        // Execute both transactions concurrently using Promise.all
        let [ shioResult,normalResult] = await Promise.all([

            shioClient.executeTransactionBlock({
                transactionBlock: Shiosig.bytes,
                signature: Shiosig.signature,
                options:{
                    showEffects: true
                }
            }),
            localClient.executeTransactionBlock({
                
                transactionBlock: Normalsig.bytes,
                signature: Normalsig.signature,
                options:{
                    showEffects: true,

                }
            })
        ]);
        // wait a second then fetch from chain so we can get checkpoint info etc


        
        try {
            let normalProcess = processTransationResult(normalResult)
            let shioProcess = processTransationResult(shioResult,estimatedFee.tipAmount)
            
            if(normalProcess.versionofpool < shioProcess.versionofpool){
                console.log(`Normal transaction happened first processed with version of pool at  ${normalProcess.versionofpool} compared to shio at ${shioProcess.versionofpool} and digest is normal: ${normalProcess.digest} shio: ${shioProcess.digest}`)
                normalFasterCount++;
            }else{
                console.log(`Shio transaction happened first processed with version of pool at ${shioProcess.versionofpool} compared to normal at ${normalProcess.versionofpool} and digest is shio: ${shioProcess.digest} normal: ${normalProcess.digest}`)
                shioFasterCount++;
            }
        } catch (error) {
            console.log("One of the transactions failed, continuing...")
            console.log(error)
            continue
        }
        //small delay to avoid locked objects
        await new Promise(resolve => setTimeout(resolve, 400));
    }

    // Add summary statistics at the end
    const totalSuccessful = shioFasterCount + normalFasterCount;
    console.log("\n=== Performance Summary ===");
    console.log(`Total successful comparisons: ${totalSuccessful}`);
    console.log(`Shio faster: ${shioFasterCount} times (${((shioFasterCount/totalSuccessful)*100).toFixed(2)}%)`);
    console.log(`Normal faster: ${normalFasterCount} times (${((normalFasterCount/totalSuccessful)*100).toFixed(2)}%)`);
}

type TransactionResult = {
    versionofpool:number,
    totalspentonfees:number,
    digest:string
}
function processTransationResult(result:SuiTransactionBlockResponse,shiotip?:number):TransactionResult{

    
    let effects = result.effects
    if(!effects || !effects.modifiedAtVersions){
        throw new Error("No effects found in transaction result")
    }
    // loop through mutated objects and find the pool object
    let poolObject = effects.modifiedAtVersions.find(obj => obj.objectId=== CETUS_SUI_USDC_POOL_ID)
    if(!poolObject){
            throw new Error("Pool object not found in transaction result")
        }
    let versionofpool = poolObject.sequenceNumber
    let totalspentonfees = Number(effects.gasUsed.storageCost) + Number(effects.gasUsed.computationCost) - Number(effects.gasUsed.storageRebate)+Number(effects.gasUsed.nonRefundableStorageFee)
    if(shiotip){
        totalspentonfees += shiotip
    }
    return {versionofpool:Number(versionofpool),totalspentonfees:Number(totalspentonfees),digest:result.digest}


}

main();


