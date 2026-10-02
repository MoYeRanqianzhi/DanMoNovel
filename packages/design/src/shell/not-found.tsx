/**
 * "找不到这一页"：各站交给 <PageStack missing> 的 handle
 *
 * 任何路由的 loader 返回 MISSING（书不存在、章节超出范围、地址写错）时，页面栈用它渲染这一页：
 * 放在页面栈里，和普通页面一样淡入、叠放，导航照常可用。左上角返回上一页；
 * 深链接打开、栈里没有上一页时，返回与按钮都回到站点首页。
 * 三个站只有按钮上的字、首页的地址与说法不同，所以做成一个按站点生成 handle 的函数，在各站 shell.tsx 的模块顶层调用一次。
 */
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { ErrorPage, type NotFoundCopy } from '../components/ErrorPage';
import { IconButton } from '../components/ui';
import { useStack, type Missing, type ScreenHandle } from './stack';

/**
 * homeLabel：回首页按钮上的字，例如"回到书城"。
 * home：首页（第一个标签页）的地址。作者站的 / 是给访客看的落地页（会收起导航），书房在 /desk，所以要传进来。
 * copy：这一站找不到时的标题与说明（小说站"不在书架上"、作者站"不在书房里"、管理站"不在案卷里"）。
 */
export function notFoundHandle(homeLabel: string, home: string, copy: NotFoundCopy): ScreenHandle<Missing> {
  function NotFoundScreen() {
    const { back } = useStack();
    const navigate = useNavigate();
    return (
      <>
        <div className="subbar">
          <IconButton label="返回" onClick={back}>
            <ArrowLeft aria-hidden="true" />
          </IconButton>
        </div>
        <ErrorPage
          kind="not-found"
          inline
          copy={copy}
          action={
            // 与点导航上的标签一样带 tab 标记：替换掉这条记录，并清空页面栈（首页不该叠在别的页上面）
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate(home, { replace: true, state: { tab: true } })}
            >
              {homeLabel}
            </button>
          }
        />
      </>
    );
  }
  return { Screen: NotFoundScreen, name: 'not-found', parent: () => home };
}
