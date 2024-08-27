const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');

const connection = new Connection('https://api.mainnet-beta.solana.com');
const walletAddress = new PublicKey('PASTE WALLET HERE');
const webhookUrl = 'PASTE YOUR WEBHOOK HERE';

let knownSignatures = []; 

async function getSolanaPrice() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        return response.data.solana.usd;
    } catch (error) {
        console.error('Error fetching Solana price:', error);
        return null;
    }
}

async function fetchRecentTransactions() {
    try {
        const signatures = await connection.getConfirmedSignaturesForAddress2(
            walletAddress,
            { limit: 10 } 
        );
        return signatures;
    } catch (error) {
        console.error('Error fetching recent transactions:', error);
        return [];
    }
}

async function getWalletBalance() {
    try {
        const lamports = await connection.getBalance(walletAddress);
        const sol = lamports / 1_000_000_000; 
        const solPrice = await getSolanaPrice();
        const usdAmount = sol * solPrice;
        return { sol, usdAmount };
    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        return { sol: 0, usdAmount: 0 };
    }
}

async function checkForNewTransactions() {
    const recentTransactions = await fetchRecentTransactions();
    const solPrice = await getSolanaPrice();
    const { sol: walletSol, usdAmount: walletUsd } = await getWalletBalance();

    const newest = Math.floor(Date.now() / 1000) - 60;

    const newSignatures = recentTransactions
        .filter(tx => tx.blockTime > newest) 
        .map(tx => tx.signature)
        .filter(signature => !knownSignatures.includes(signature)); 
    if (newSignatures.length > 0) {
        console.log('New transactions found:', newSignatures);


        for (let signature of newSignatures) {
            const transaction = await connection.getConfirmedTransaction(signature);
            const solAmount = (transaction.meta.postBalances[0] - transaction.meta.preBalances[0]) / 1_000_000_000;
            const usdAmount = solAmount * solPrice;

            const embed = {
                title: `${walletAddress.toString()}`,
                description: `[View wallet](https://solscan.io/account/${walletAddress.toString()})`,
                color: 0x8B0000, 
                fields: [
                    {
                        name: 'Current Wallet Balance (SOL)',
                        value: `${walletSol.toFixed(9)} SOL`,
                        inline: true
                    },
                    {
                        name: 'Current Wallet Balance (USD)',
                        value: `$${walletUsd.toFixed(2)}`,
                        inline: true
                    },
                    {
                        name: 'New Transaction Signature',
                        value: `[View on Solscan](https://solscan.io/tx/${signature})`,
                        inline: false
                    },
                    {
                        name: 'SOL Amount',
                        value: `${solAmount.toFixed(9)} SOL`,
                        inline: true
                    },
                    {
                        name: 'USD Amount',
                        value: `$${usdAmount.toFixed(2)}`,
                        inline: true
                    },
                    {
                        name: 'Transaction Time',
                        value: `${new Date(transaction.blockTime * 1000).toLocaleString()}`,
                        inline: false
                    }
                ],
                footer: {
                    text: 'Transaction and Balance Notification'
                }
            };

            try {
                await axios.post(webhookUrl, { embeds: [embed] });
                console.log('Embed notification sent to Discord:', embed);
            } catch (error) {
                console.error('Error sending embed notification:', error);
            }
        }

        
        knownSignatures = [...newSignatures, ...knownSignatures].slice(0, 100); 
        console.log('No new transactions found.');
    }
}


async function main() {
    while (true) {
        await checkForNewTransactions();
       
        await new Promise(resolve => setTimeout(resolve, 60000));
    }
}
main();
