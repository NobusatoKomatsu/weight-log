# 体脂肪率

個人向け体重管理ダッシュボード

## ▶ Androidアプリ（Health Connect 自動連携）

**[weight-log.apk をダウンロード](https://github.com/NobusatoKomatsu/weight-log/releases/download/app/weight-log.apk)**

AiLink などが Health Connect に書き込んだ体重・体脂肪率を、アプリを開くたびに自動で取り込みます。

## ▶ ブラウザ版

**https://sixpac.jp/**

記録したデータは端末内にだけ保存され、GitHub や外部のサーバーには送られません。

## ▶ 世界の石 図鑑

**https://sixpac.jp/stones/**

世界中の鉱物・岩石・隕石・名のある巨石（約 1 万 1 千件）を、写真つきで一覧・検索できる図鑑です。

- 名前（日本語・英語）、化学式、含まれる元素、化学分類、結晶系、硬さ、密度、できかた、国、重さ・高さで絞り込み
- 地図で産地・落下地点・所在地を表示。現在地の近くの石も探せます
- 石ごとに、Wikipedia の解説、Wikimedia Commons の写真、Mastodon の投稿、Mindat などへのリンクを表示

データは `stones/data/stones.json` に入っています。`node stones/tools/build-data.mjs` が Wikidata から作り直し、GitHub Actions「Stones data」が毎月 1 日に自動で更新します。
