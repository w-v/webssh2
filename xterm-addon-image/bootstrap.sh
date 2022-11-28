#!/bin/bash

set -e

export XTERMJS=5.0.0

# clone xterm.js base repo
git clone --depth 1 --branch ${XTERMJS} https://github.com/xtermjs/xterm.js.git
cd xterm.js
rm -rf .git

# clone addon
cd addons
git clone https://github.com/w-v/xterm-addon-image
cd ..

# overwrite files in base repo to have full test integration
cp -av addons/xterm-addon-image/overwrite/* .
# client.ts is named ts_copy to avoid TS recognizing it, rename
mv demo/client.ts_copy demo/client.ts

# to fix eslint
cp -av addons/xterm-addon-image/overwrite/.eslintrc.json .

rm -rf addons/xterm-addon-ligatures

sed -i '/ligatures/d' tsconfig.all.json

# init all
yarn --verbose

cd addons/xterm-addon-image
npm run package

cd ../../..
cp -rn xterm.js/addons/xterm-addon-image xterm-addon-image
rm -rf xterm.js
