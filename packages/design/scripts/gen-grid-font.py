"""
方格稿纸的补字字体生成脚本：输出 src/manuscript/danmo-grid.woff2（字体名 Danmo Grid）

用法：仓库根目录 `python packages/design/scripts/gen-grid-font.py`
依赖：Python 3、fontTools 与 brotli（pip install fonttools brotli）；源字体取自已安装的 lxgw-wenkai-screen-webfont。

为什么需要它：
方格稿纸要求一个字正好落进一格。稿纸用字间距把每个字的步进凑成格宽（见 manuscript.css），
这只对"一个字宽"的字符成立。霞鹜文楷屏幕阅读版里，汉字与大部分中文标点都是一个字宽，
但弯双引号“”只有 0.35 个字宽，英文字母、数字与半角标点也宽窄不一；稿纸上只要出现一个，
这一行后面的字就全部错开，换行的位置也跟着变。文楷没有 fwid（全角形）特性，CSS 的
font-variant-east-asian: full-width 对它不起作用，所以只能自己派生一套全角的字形。

做法：从文楷里取出这些字符的字形，步进一律改成一个字宽（文楷的 2048 单位），字形放进这一格里：
- 左引号“贴着格子右边（紧挨后面的字），右引号”贴着格子左边（紧挨前面的字），与中文全角引号的位置一致；
- 其余字符在格子里居中。
生成的字体只含这些字符。稿纸的字体栈把它放在文楷前面，其余字符照常由文楷显示。
纵向度量（hhea、OS/2 的 ascent 与 descent）照抄文楷：字体栈里排第一的字体决定行框与基线，
照抄之后，行框和基线与只用文楷时完全一致。

许可：霞鹜文楷以 SIL Open Font License 1.1 发布。派生字体沿用同一许可，与字体放在一起的
danmo-grid-OFL.txt 由本脚本一并写出；字体改名为 Danmo Grid，不使用原字体的名字。
源字体升级后重新运行本脚本即可；不要手改生成出来的字体。
"""
import re
import sys
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

DESIGN = Path(__file__).resolve().parent.parent
SOURCE = DESIGN / 'node_modules' / 'lxgw-wenkai-screen-webfont'
OUT_DIR = DESIGN / 'src' / 'manuscript'

# 要改成一个字宽的字符：空格与 ASCII 可见字符、间隔号、乘号、短横、弯双引号。
# 改动这张表时，manuscript.css 里 @font-face 的 unicode-range 要一起改
CODEPOINTS = [*range(0x20, 0x7F), 0xB7, 0xD7, 0x2013, 0x201C, 0x201D]
LEFT_QUOTE, RIGHT_QUOTE = 0x201C, 0x201D


def subset_ranges():
    """文楷的 CSS 把字体切成许多子集文件：列出每个文件与它覆盖的码位范围"""
    css = (SOURCE / 'lxgwwenkaiscreen.css').read_text(encoding='utf-8')
    out = []
    for block in re.findall(r'@font-face\s*{(.*?)}', css, re.S):
        src = re.search(r"url\('?\./([^')]+)'?\)", block).group(1)
        spans = []
        for part in re.search(r'unicode-range:\s*([^;}]+)', block).group(1).split(','):
            part = part.strip().lower().replace('u+', '')
            lo, _, hi = part.partition('-')
            spans.append((int(lo, 16), int(hi or lo, 16)))
        out.append((SOURCE / src, spans))
    return out


def main():
    # Windows 的控制台默认不是 UTF-8，中文提示会变成乱码
    sys.stdout.reconfigure(encoding='utf-8')
    ranges = subset_ranges()
    opened = {}

    def font_for(cp):
        for path, spans in ranges:
            if any(lo <= cp <= hi for lo, hi in spans):
                if path not in opened:
                    opened[path] = TTFont(path)
                return opened[path]
        raise SystemExit(f'文楷里找不到 U+{cp:04X}')

    ref = font_for(0x41)
    upm = ref['head'].unitsPerEm
    glyphs = {'.notdef': TTGlyphPen(None).glyph()}
    cmap = {}
    for cp in CODEPOINTS:
        src = font_for(cp)
        name = src.getBestCmap()[cp]
        advance = src['hmtx'][name][0]
        if cp == LEFT_QUOTE:
            dx = upm - advance
        elif cp == RIGHT_QUOTE:
            dx = 0
        else:
            dx = round((upm - advance) / 2)
        # 先拆开复合字形（引用了别的字形的），再整体平移进新的一格
        glyph_set = src.getGlyphSet()
        recording = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(recording)
        pen = TTGlyphPen(None)
        recording.replay(TransformPen(pen, (1, 0, 0, 1, dx, 0)))
        glyphs[f'uni{cp:04X}'] = pen.glyph()
        cmap[cp] = f'uni{cp:04X}'

    order = list(glyphs)
    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    glyf = fb.font['glyf']
    for name in order:
        glyf[name].recalcBounds(glyf)
    fb.setupHorizontalMetrics({name: (upm, getattr(glyf[name], 'xMin', 0)) for name in order})

    hhea, os2 = ref['hhea'], ref['OS/2']
    fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent, lineGap=hhea.lineGap)
    copyright_ = ref['name'].getDebugName(0)
    fb.setupNameTable(
        {
            'copyright': f'{copyright_}\nDanmo Grid: full-width spacing derived by the Danmo contributors.',
            'familyName': 'Danmo Grid',
            'styleName': 'Regular',
            'uniqueFontIdentifier': 'Danmo Grid Regular',
            'fullName': 'Danmo Grid Regular',
            'psName': 'DanmoGrid-Regular',
            'version': 'Version 1.000',
            'description': 'Full-width ASCII and curly quotes derived from LXGW WenKai Screen, for manuscript grid paper.',
            'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
            'licenseInfoURL': 'https://openfontlicense.org',
        }
    )
    fb.setupOS2(
        # 版本照抄文楷：fsSelection 的第 8 位（WWS）要求 OS/2 第 4 版及以上
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
    fb.save(OUT_DIR / 'danmo-grid.woff2')

    license_text = (SOURCE / 'OFL.txt').read_text(encoding='utf-8')
    (OUT_DIR / 'danmo-grid-OFL.txt').write_bytes(
        (
            'Danmo Grid (danmo-grid.woff2) is derived from LXGW WenKai Screen:\n'
            'the glyphs listed in packages/design/scripts/gen-grid-font.py were re-spaced to full width.\n\n'
            f'{copyright_}\n\n{license_text}'
        )
        .replace('\r\n', '\n')
        .encode('utf-8')
    )
    print(f'danmo-grid.woff2: {len(cmap)} 个字符，{(OUT_DIR / "danmo-grid.woff2").stat().st_size} 字节')


if __name__ == '__main__':
    main()
