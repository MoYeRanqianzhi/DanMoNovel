"""
界面无衬线字体的引号补字字体生成脚本：输出 src/styles/danmo-quotes.woff2（字体名 Danmo Quotes）

用法：仓库根目录 `python packages/design/scripts/gen-quotes-font.py`
依赖：Python 3、fontTools 与 brotli（pip install fonttools brotli）；源字体取自已安装的 @fontsource/noto-sans-sc。

为什么需要它：
界面文字的字体栈（tokens.css 的 --font-sans）打头是 system-ui，在西文系统上是 Segoe UI、SF，
弯双引号“”会取它们的窄字形（约 0.35 个字宽），紧贴着汉字，与全角的逗号、句号也不搭；
苹方的“”同样是窄的，所以换成本机的中文字体也救不了苹果设备。
思源黑体（Noto Sans SC）的“”是一个字宽、位置按中文排（左引号贴右、右引号贴左），
这里只取这两个字形另做一款小字体，放在 --font-sans 最前面、用 unicode-range 只管这两个码位，
其余的字照旧由 system-ui 与后面的中文字体显示。

楷体那边（--font-kai 与阅读器的文楷）用的是稿纸的补字字体 Danmo Grid 里的“”（gen-grid-font.py 生成）。

纵向度量照抄思源黑体；它在字体栈里排第一，但 unicode-range 不含空格，按 CSS Fonts 的规定
不算"第一个可用字体"，行框与基线仍由 system-ui 决定。

许可：思源黑体（Noto Sans SC）以 SIL Open Font License 1.1 发布。派生字体沿用同一许可，与字体放在一起的
danmo-quotes-OFL.txt 由本脚本一并写出；字体改名为 Danmo Quotes。源字体升级后重新运行本脚本即可；不要手改生成出来的字体。
"""
import re
import sys
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

DESIGN = Path(__file__).resolve().parent.parent
SOURCE = DESIGN / 'node_modules' / '@fontsource' / 'noto-sans-sc'
OUT_DIR = DESIGN / 'src' / 'styles'

# 只要弯双引号。单引号‘’不要：用户写的英文撇号也是 ’，做成一个字宽，"Let’s"会散开。
# 改动这张表时，tokens.css 里 Danmo Quotes 的 unicode-range 要一起改
CODEPOINTS = [0x201C, 0x201D]


def source_file():
    """思源黑体的 400 字重切成许多子集文件：找出含弯双引号的那一个"""
    css = (SOURCE / '400.css').read_text(encoding='utf-8')
    for block in re.findall(r'@font-face\s*{(.*?)}', css, re.S):
        spans = []
        for part in re.search(r'unicode-range:\s*([^;}]+)', block).group(1).split(','):
            part = part.strip().lower().replace('u+', '')
            lo, _, hi = part.partition('-')
            spans.append((int(lo, 16), int(hi or lo, 16)))
        if all(any(lo <= cp <= hi for lo, hi in spans) for cp in CODEPOINTS):
            return SOURCE / 'files' / re.search(r'url\(\./files/([^)]+\.woff2)\)', block).group(1)
    raise SystemExit('思源黑体里找不到含弯双引号的子集')


def main():
    # Windows 的控制台默认不是 UTF-8，中文提示会变成乱码
    sys.stdout.reconfigure(encoding='utf-8')
    src = TTFont(source_file())
    upm = src['head'].unitsPerEm
    glyph_set = src.getGlyphSet()
    glyphs = {'.notdef': TTGlyphPen(None).glyph()}
    advances = {'.notdef': upm}
    cmap = {}
    for cp in CODEPOINTS:
        name = src.getBestCmap()[cp]
        advance = src['hmtx'][name][0]
        # 思源黑体的这两个字形本来就是一个字宽：照搬，不挪位置。哪天源字体改窄了就停下来，别悄悄生成一款窄的
        if advance != upm:
            raise SystemExit(f'U+{cp:04X} 的步进是 {advance}，不是一个字宽 {upm}')
        # 先拆开复合字形（引用了别的字形的），新字体里只有这两个字形
        recording = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(recording)
        pen = TTGlyphPen(None)
        recording.replay(pen)
        glyphs[f'uni{cp:04X}'] = pen.glyph()
        advances[f'uni{cp:04X}'] = advance
        cmap[cp] = f'uni{cp:04X}'

    order = list(glyphs)
    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    glyf = fb.font['glyf']
    for name in order:
        glyf[name].recalcBounds(glyf)
    fb.setupHorizontalMetrics({name: (advances[name], getattr(glyf[name], 'xMin', 0)) for name in order})

    hhea, os2 = src['hhea'], src['OS/2']
    fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent, lineGap=hhea.lineGap)
    copyright_ = src['name'].getDebugName(0)
    fb.setupNameTable(
        {
            'copyright': f'{copyright_}\nDanmo Quotes: curly double quotes subset by the Danmo contributors.',
            'familyName': 'Danmo Quotes',
            'styleName': 'Regular',
            'uniqueFontIdentifier': 'Danmo Quotes Regular',
            'fullName': 'Danmo Quotes Regular',
            'psName': 'DanmoQuotes-Regular',
            'version': 'Version 1.000',
            'description': 'Full-width curly double quotes from Noto Sans SC, for Chinese UI text set in system fonts.',
            'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
            'licenseInfoURL': 'https://openfontlicense.org',
        }
    )
    fb.setupOS2(
        version=os2.version,
        usWeightClass=400,
        fsSelection=os2.fsSelection,
        sTypoAscender=os2.sTypoAscender,
        sTypoDescender=os2.sTypoDescender,
        sTypoLineGap=os2.sTypoLineGap,
        usWinAscent=os2.usWinAscent,
        usWinDescent=os2.usWinDescent,
        sxHeight=getattr(os2, 'sxHeight', 0),
        sCapHeight=getattr(os2, 'sCapHeight', 0),
        achVendID='DANM',
    )
    fb.setupPost()
    fb.font.flavor = 'woff2'
    fb.save(OUT_DIR / 'danmo-quotes.woff2')

    # @fontsource 的 LICENSE 开头是版权人，后面是 OFL 全文
    license_text = (SOURCE / 'LICENSE').read_text(encoding='utf-8')
    (OUT_DIR / 'danmo-quotes-OFL.txt').write_bytes(
        (
            'Danmo Quotes (danmo-quotes.woff2) is derived from Noto Sans SC:\n'
            'the curly double quotes listed in packages/design/scripts/gen-quotes-font.py, unchanged, in a font of their own.\n\n'
            f'{copyright_}\n\n{license_text}'
        )
        .replace('\r\n', '\n')
        .encode('utf-8')
    )
    print(f'已生成 {OUT_DIR / "danmo-quotes.woff2"}（{len(CODEPOINTS)} 个字形）')


if __name__ == '__main__':
    main()
