import { SuiClient, SuiTransactionBlockResponse } from "@mysten/sui/client"
import { Transaction } from "@mysten/sui/transactions"
import { SUI_CLOCK_OBJECT_ID, SUI_TYPE_ARG } from "@mysten/sui/utils"
import { Keypair } from '@mysten/sui/cryptography';

import { EstimateFee, ExecuteTransactionBlock, ExecuteBundle, AppendCoinToTip, ShioFastRpcUrl } from "shio-fast-sdk";
import { normal_wallet, shio_wallet } from "./wallet.js";

const NODE_URL = "https://fullnode.mainnet.sui.io:443"

async function testBundle(){
    const client = new SuiClient({url: ShioFastRpcUrl})
    const localClient = new SuiClient({url: NODE_URL})
    const tx = new Transaction()
    tx.setSender(normal_wallet.toSuiAddress())
    tx.splitCoins(tx.gas, [1_000_000])
    tx.setGasBudget(1000000)
    let signed = await tx.sign({client,signer:normal_wallet})

    const tx2 = new Transaction()
    tx2.setSender(shio_wallet.toSuiAddress())
    tx2.splitCoins(tx2.gas, [1_000_000])
    tx2.setGasBudget(1000000)
    let signed2 = await tx2.sign({client,signer:shio_wallet})

    let bundle = [signed,signed2]
    let result = await ExecuteBundle(localClient,bundle)
    console.log(result)
    
    

}

testBundle()