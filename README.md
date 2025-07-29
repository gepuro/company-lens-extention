# 拡張機能のビルド方法
```
brew install node
npm install --omit=dev
zip -r company-lens-extention-v1.0.1.dxt manifest.json package.json server node_modules
brew uninstall node
```
