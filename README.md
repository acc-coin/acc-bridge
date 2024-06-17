# ACC Bridge

## Install NodeJS

https://nodejs.org/en/download

## Install yarn

```shell
npm install -g yarn
```

## Install Project

```shell
git clone https://github.com/acc-coin/acc-bridge.git
cd acc-bridge
yarn install
```

## Test Project

```shell
cd packages/contracts
cp -r env/.env.sample env/.env
yarn run test
```
