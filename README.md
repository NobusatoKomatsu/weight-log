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

世界中の鉱物・岩石・隕石を、名前・化学式・含まれる元素・結晶系・硬度・密度・色・できかた（成因）・産地（国や地図上の距離）・質量や大きさから、画像つきで一覧・検索できます。

- 基礎データ: [Wikidata](https://www.wikidata.org/)（鉱物の化学式・結晶系・硬度・密度・色・模式産地と座標・発見年、岩石の成因分類、隕石の質量・寸法・落下地点）
- 解説と写真: Wikipedia（日本語→英語）・Wikimedia Commons
- SNS: Mastodon と Bluesky の公開投稿を画像つきで表示。X・Instagram・Reddit・Flickr・mindat.org へは検索リンクで移動
- データは `stones/build-data.mjs` が Wikidata から取得して `stones/data/stones.json` に保存します（GitHub Actions「Stones data」が毎週自動更新。手動実行も可）。ファイルが無いときはブラウザが Wikidata から直接取得して端末内にキャッシュします。
