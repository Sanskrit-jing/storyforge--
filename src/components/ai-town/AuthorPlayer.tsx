import type { Project,WorkspaceScope } from '../../lib/types';
import AiTownPanel from './AiTownPanel';
export default function AuthorPlayer({scope,project,sessionId,page,onSession}:{scope:WorkspaceScope|null;project?:Project;sessionId:number|null;page:string;onSession:(id:number)=>void}){
 if(!scope||!project)return <section className="lf-paper"><h3>进入小镇</h3><p>这里可查看居民生活、邻里变化及存档。请从作品库选择小镇；完成制作并试玩或发布后，就能建立独立的游玩存档。</p></section>;
 return <div className="town-runtime"><AiTownPanel project={project} worldGroupId={null} workspaceScope={scope} initialSessionId={sessionId} view={page as 'play'|'relationships'|'history'} onSessionSelected={onSession}/></div>;
}
