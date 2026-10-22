"""参加URLが未確定の段階で、実アプリ画像と明示的な画面イメージを使った参加案内を作る。"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/OtO-Canvas_Closed_Test_Guide.pdf'
pdfmetrics.registerFont(TTFont('JP', 'C:/Windows/Fonts/BIZ-UDGothicR.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('Bold', 'C:/Windows/Fonts/BIZ-UDGothicB.ttc', subfontIndex=0))
c = canvas.Canvas(str(OUT), pagesize=(595.28, 841.89))
c.setTitle('OtO Canvas Android クローズドテスト参加ガイド')
c.setAuthor('OtO Canvas')
INK, TEAL = '#292b32', '#377f89'

# 座標を上から指定できるようにし、画像と説明の位置を統一する。
def text(x, top, value, size=11, bold=False, color=INK):
    c.setFont('Bold' if bold else 'JP', size)
    c.setFillColor(HexColor(color))
    c.drawString(x, 841.89-top-size, value)

# 長文を指定幅で折り返し、実際の段落高さを返す。
def paragraph(x, top, value, width=507, size=11):
    p=Paragraph(value, ParagraphStyle('p',fontName='JP',fontSize=size,leading=size*1.65,wordWrap='CJK',textColor=HexColor(INK)))
    _, height=p.wrap(width,900)
    p.drawOn(c,x,841.89-top-height)
    return height

# イメージ図内の操作ボタンを強調する。実際のGoogle画面を複製するものではない。
def button(x, top, width, label):
    c.setFillColor(HexColor(TEAL)); c.roundRect(x,841.89-top-34,width,34,10,fill=1,stroke=0)
    text(x+12,top+8,label,11,True,'#ffffff')

# ページの共通枠と、資料の種類が分かるフッターを描く。
def page(number,title,sub):
    if number>1:c.showPage()
    c.setFillColor(HexColor('#fffdf8'));c.rect(0,0,595.28,841.89,fill=1,stroke=0)
    text(44,28,'OtO Canvas / Android クローズドテスト',11,True,TEAL)
    text(44,60,title,23,True)
    text(44,98,sub,10)
    c.setStrokeColor(HexColor('#dedbd3'));c.line(44,42,551,42)
    text(44,810,'参加URL・開始日・終了日は、募集者から別途お知らせします。',8)
    text(518,810,f'{number} / 2',9)

# Google Play未公開のため、参加導線だけを説明する架空画面として描く。
def mock(x,top,kind):
    w,h=228,258
    c.setFillColor(HexColor('#ffffff'));c.setStrokeColor(HexColor('#c9d5d5'))
    c.roundRect(x,841.89-top-h,w,h,15,fill=1,stroke=1)
    text(x+14,top+14,'画面イメージ（実際の画面ではありません）',8,False,TEAL)
    text(x+16,top+47,'OtO Canvas',18,True)
    if kind=='join':
        text(x+16,top+84,'Googleアカウントを確認',11,True)
        paragraph(x+16,top+110,'募集者に伝えたアカウントで<br/>テストに参加してください。',195,10)
        button(x+16,top+167,196,'テスターになる')
        text(x+16,top+220,'英語では Become a tester など',9)
    else:
        text(x+16,top+84,'Google Play のアプリページ',11,True)
        paragraph(x+16,top+110,'アプリ名とアイコンを確認。<br/>参加時と同じアカウントを使います。',195,10)
        button(x+16,top+167,196,'インストール')
        text(x+16,top+220,'完了後は「開く」などの表示に変化',9)

page(1,'参加登録とインストール','Androidスマホをご用意ください。パソコンだけ・iPhoneだけでは今回の確認はできません。')
paragraph(44,132,'ご協力ありがとうございます！ まずは、募集者から届く案内に沿って参加登録し、Google Playからインストールしてください。長い遊び方の説明はありません。')
text(44,197,'準備：使うGoogleアカウントをそろえる',14,True,TEAL)
paragraph(44,225,'メール招待方式：Google Playで使うGoogleアカウントのメールアドレスを募集者へ伝え、登録完了の連絡を待ちます。<br/>グループ方式：案内されたGoogleグループへ先に参加します。<br/>どちらの方式でも、パスワードや確認コードを募集者へ送る必要はありません。',size=10)
text(44,313,'1  届いた参加リンクを開く',13,True)
text(316,313,'2  Google Playから入れる',13,True)
mock(44,345,'join'); mock(316,345,'install')
paragraph(44,622,'参加ページでアカウントを確認し、「テスターになる」などの参加ボタンを押します。参加済みと分かる表示を確認してください。',228,10)
paragraph(316,622,'参加ページにあるGoogle Playへのリンクへ進み、「インストール」を押します。アプリ名で検索するより、届いたリンクから進んでください。',228,10)
paragraph(44,718,'※ この資料の参加・ストア画面は説明用イメージです。ボタン名や配置は変わる場合があります。APKを直接受け取って入れるだけでは、クローズドテストの参加登録にはなりません。',size=9)

page(2,'開けたことを伝えて、参加を継続','画像はOtO Canvasの実画面です。Google Playの画面イメージとは区別しています。')
text(44,133,'3  一度開いて確認する',14,True,TEAL)
paragraph(44,160,'「開く」を押してHomeが表示されたら、「参加・インストールできました」と募集者へ連絡してください。初回の設定が出た場合は画面に沿って進み、カメラは「使わない」でも構いません。',size=11)
for x,name in [(44,'home'),(221,'editor')]:
    c.drawImage(str(ROOT/f'output/manual-assets/otocanvas-{name}.png'),x,841.89-230-280,width=129.4,height=280,mask='auto')
text(44,518,'実画面：Home',9,True)
text(221,518,'実画面：編集',9,True)
paragraph(386,250,'短い動作確認の例<br/><br/>三角ボタンから進み、図形を1つ置いて再生。<br/><br/>開けない・音が出ない場合は、そのまま募集者へ知らせてください。<br/><br/>カメラ許可や長時間のプレイは、この案内ではお願いしていません。',158,10)
text(44,550,'4  終了の連絡まで、テストに参加したままにする',13,True,TEAL)
paragraph(44,577,'参加ページの「テストを終了」「プログラムから退出」などは、終了案内が来るまで押さないでください。アプリも残しておき、追加確認や更新をお願いされたときはご協力ください。これは募集側からのお願いです。',size=10)
paragraph(44,642,'参加できないとき：ブラウザとGoogle Playのアカウントが同じか確認し、募集者へエラー画面を送ってください。アドレスなどの個人情報は必要な部分以外を隠してください。',size=9)
paragraph(44,694,'画像：ver 0.4.11のAndroid同梱ファイルをブラウザで実行したスクリーンショットです。Android実機の画面とは一部表示が異なります。<br/>募集者向け補足：対象の新規個人アカウントは12人以上が14日間連続で参加後、公開アクセスを申請します。利用状況・フィードバックも問われるため、参加維持だけで承認が確定するわけではありません。',size=8)
paragraph(44,767,'公式資料：<link href="https://support.google.com/googleplay/android-developer/answer/14151465?hl=ja" color="#377f89">テスト要件</link> ／ <link href="https://support.google.com/googleplay/android-developer/answer/9845334?hl=ja" color="#377f89">テスターの参加方法</link>',size=8)
c.save()
assert len(PdfReader(str(OUT)).pages)==2
print(OUT)

