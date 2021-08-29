# Myobu V2 Token

The Myobu V2 Token, has team fee based on if its a buy or sell or if its a transfer to a taxed address. No fee when adding liquidity or removing liquidity

Has snapshot functionality to be called by another contract (DAO).

## Requirements:

Node.js (https://nodejs.dev/)

Optionally: Pnpm (https://pnpm.io/)

## Config:

Secrets: Rename the secrets.json.dist to secrets.json and put in the values

Config: Change config in config.json

## First:

    pnpm install

## Available Scripts:

### `pnpm test`

### `pnpm test:testnet`

Runs tests in the `test` directory, on a local network or on testnet

### `pnpm compile`

Compiles all the soliidity contracts

### `pnpm typechain`

Use typechain to generate types for the solidity contracts

### `pnpm coverage`

Generate code coverage for the contracts

### `pnpm deploy`

### `pnpm deploy:testnet`

### `pnpm deploy:mainnet`

Deploy contracts, deploy scripts in ./deploy/

Can be done on mainnet, testnet, or the local network

### `pnpm lint`

### `pnpm lint:fix`

Lints the solidity and typescript code

### `pnpm format`

### `pnpm format:fix`

Formats the solidity and typescript code

### `pnpm verify:testnet <address> <constructor arguments>`

### `pnpm verify:mainnet <address> <constructor arguments>`

Verfies the contracts on etherscan
