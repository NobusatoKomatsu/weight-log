# 体脂肪率

個人向け体重管理ダッシュボード

## ▶ Androidアプリ（Health Connect 自動連携）

**[weight-log.apk をダウンロード](https://github.com/NobusatoKomatsu/weight-log/releases/download/app/weight-log.apk)**

AiLink などが Health Connect に書き込んだ体重・体脂肪率を、アプリを開くたびに自動で取り込みます。

## ▶ ブラウザ版

**https://sixpac.jp/**

記録したデータは端末内にだけ保存され、GitHub や外部のサーバーには送られません。

---

# Androidアプリ一掃アプリ

いらなくなったアプリだけチェックを外して、まとめて削除するアプリです。ソースは `sweep-android/` にあります。

**[app-sweep.apk をダウンロード](https://github.com/NobusatoKomatsu/weight-log/releases/download/sweep/app-sweep.apk)**

- **はじめは全部「残す」**にチェックが入っています。いらないアプリだけチェックを外して実行します
- Android で削除できないアプリ（最初から入っているシステムアプリ）と、このアプリ自身は対象外（一覧に出ません）
- 「使っていない順 / 大きい順 / 名前順」で並べ替え（最後に使った日と容量つき）
- **誤って消さないための仕組み**
  - チェックを外したアプリは赤く表示
  - 削除の前に、消すアプリを全部並べた確認画面。「確認しました」にチェックを入れるまで削除を始められません
  - そのあと Android の確認が 1個ずつ出ます。途中でやめることもできます
  - 外したチェックは保存しません。アプリを開き直すと、すべて「残す」に戻ります
- 入っているアプリの一覧や使用状況は、端末の外には送りません（通信は一番下の広告の表示だけ）

最後に使った日とデータを含めた容量を出すには、「使用状況へのアクセス」の許可が必要です（アプリが案内します）。許可しない場合は、入れた日とアプリ本体の大きさで表示します。

Google Play への申請手順と、入力する文章は [sweep-android/store/README.md](sweep-android/store/README.md) にあります。公式サイト（https://applications.sucks）の中身は `sweep-site/` にあります（Cloudflare Workers で公開）。
