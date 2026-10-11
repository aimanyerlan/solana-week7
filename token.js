const fs = require("fs");
const os = require("os");
const {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  TOKEN_2022_PROGRAM_ID, ExtensionType, TYPE_SIZE, LENGTH_SIZE,
  createInitializeMetadataPointerInstruction, createInitializeMintInstruction,
  getMintLen, getMint, getMetadataPointerState, getTokenMetadata,
  getOrCreateAssociatedTokenAccount, mintTo, transferChecked, getAccount,
} = require("@solana/spl-token");
const { createInitializeInstruction, pack } = require("@solana/spl-token-metadata");

const NAME = "Aiman Token";
const SYMBOL = "AIM";
const URI = "https://raw.githubusercontent.com/aimanyerlan/solana-week7/refs/heads/main/token.json";
const DECIMALS = 6;
const MINT_AMOUNT = 1000;
const TRANSFER_AMOUNT = 100;

const txLink = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const addrLink = (a) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const units = (n) => BigInt(n) * 10n ** BigInt(DECIMALS);
const human = (raw) => Number(raw) / 10 ** DECIMALS;

async function main() {
  const secret = JSON.parse(fs.readFileSync(os.homedir() + "/.config/solana/id.json", "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const recipient = process.argv[2]
    ? new PublicKey(process.argv[2])
    : Keypair.generate().publicKey;

  console.log("Кошелёк (владелец токена):", payer.publicKey.toBase58());
  console.log("Получатель:               ", recipient.toBase58());

  const mint = Keypair.generate();
  const metadata = {
    updateAuthority: payer.publicKey,
    mint: mint.publicKey,
    name: NAME,
    symbol: SYMBOL,
    uri: URI,
    additionalMetadata: [],
  };

  const mintSpace = getMintLen([ExtensionType.MetadataPointer]);
  const metadataSpace = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await connection.getMinimumBalanceForRentExemption(mintSpace + metadataSpace);

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintSpace,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey, payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey, DECIMALS, payer.publicKey, null, TOKEN_2022_PROGRAM_ID
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: payer.publicKey,
      mint: mint.publicKey,
      mintAuthority: payer.publicKey,
      name: NAME,
      symbol: SYMBOL,
      uri: URI,
    })
  );
  const createSig = await sendAndConfirmTransaction(connection, createMintTx, [payer, mint]);
  console.log("\n[1] Токен создан:", mint.publicKey.toBase58());
  console.log("    Транзакция:", txLink(createSig));

  const senderAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint.publicKey, payer.publicKey,
    false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID
  );
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint.publicKey, recipient,
    true, "confirmed", undefined, TOKEN_2022_PROGRAM_ID
  );
  console.log("\n[2] Токен-аккаунт отправителя:", senderAta.address.toBase58());
  console.log("    Токен-аккаунт получателя: ", recipientAta.address.toBase58());

  const mintSig = await mintTo(
    connection, payer, mint.publicKey, senderAta.address, payer,
    units(MINT_AMOUNT), [], undefined, TOKEN_2022_PROGRAM_ID
  );
  console.log(`\n[3] Выпущено ${MINT_AMOUNT} токенов:`, txLink(mintSig));

  const transferSig = await transferChecked(
    connection, payer, senderAta.address, mint.publicKey, recipientAta.address, payer,
    units(TRANSFER_AMOUNT), DECIMALS, [], undefined, TOKEN_2022_PROGRAM_ID
  );
  console.log(`\n[4] Переведено ${TRANSFER_AMOUNT} токенов:`, txLink(transferSig));

  const mintInfo = await getMint(connection, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
  const senderAcc = await getAccount(connection, senderAta.address, "confirmed", TOKEN_2022_PROGRAM_ID);
  const recipientAcc = await getAccount(connection, recipientAta.address, "confirmed", TOKEN_2022_PROGRAM_ID);
  const pointer = getMetadataPointerState(mintInfo);
  const meta = await getTokenMetadata(connection, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);

  console.log("\n[5] Проверка");
  console.log("    Supply:             ", human(mintInfo.supply));
  console.log("    Баланс отправителя: ", human(senderAcc.amount));
  console.log("    Баланс получателя:  ", human(recipientAcc.amount));
  console.log("    Metadata pointer -> ", pointer.metadataAddress.toBase58());
  console.log("    Name / Symbol:      ", meta.name, "/", meta.symbol);
  console.log("    URI:                ", meta.uri);
  console.log("\nСтраница токена:", addrLink(mint.publicKey.toBase58()));
}

main().catch((e) => { console.error(e); process.exit(1); });