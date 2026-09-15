import { useEffect, useState } from 'react';
import type { WorkspaceScope, ProductRuntimePackageV1 } from '../../lib/types';
import { readProductProductionDetailsV1 } from '../../lib/product-production/service';
import { verifyProductBuildPreviewManifestV1 } from '../../lib/product-production/preview-manifest';
export default function BuildInspector({ scope, productionId, page, onProduction }: {
    scope: WorkspaceScope | null;
    productionId: number | null;
    page: string;
    onProduction: () => void;
}) {
    const [pkg, setPkg] = useState<ProductRuntimePackageV1 | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
    useEffect(() => { let active = true; setPkg(null); setError(''); if (!scope || !productionId)
        return; setLoading(true); void readProductProductionDetailsV1(scope, productionId, ['character-interaction']).then(async (d) => { if (!d.build?.previewManifestJson)
        return; const p = await verifyProductBuildPreviewManifestV1(d.build.previewManifestJson); if (active)
        setPkg(p.runtimePackage); }).catch(e => { if (active)
        setError(String(e)); }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, [scope, productionId]);
    return <section className="lf-paper"><h3>{page === 'characters' ? '人物快照' : page === 'scenes' ? '场景与规则' : '人物与场景素材'}</h3>{error && <p role="alert">{error}</p>}{loading ? <p>正在校验生成版本…</p> : !pkg ? <><p>尚无生成版本。制作完成后，这里显示真实产物。</p><button className="lf-action" onClick={onProduction}>查看制作流程</button></> : page === 'characters' ? <>{pkg.interaction?.profiles.map(c => <article key={c.participantKey}><h4>{c.name} · {c.roleLabel}</h4><p>{c.voiceRules}</p><p>角色标识：{c.characterKey}</p>{c.initialKnowledge.map(k => <details key={k.key}><summary>{k.visibility === 'private' ? '角色私密知识（作者查看）' : '公开知识'}</summary><p>{k.content}</p></details>)}<p>{c.relationshipDimensions.map(d => `${d.label}：${d.initial}`).join(' · ')}</p></article>)}</> : page === 'scenes' ? <>{pkg.interaction?.sceneTemplates.map(s => <article key={s.sceneKey}><h4>{s.title}</h4><p>{s.location} · {s.timeLabel}</p><p>{s.purpose}</p><p>参与：{s.participantKeys.map(k => pkg.interaction?.profiles.find(p => p.participantKey === k)?.name ?? k).join('、')}</p><p>目标：{s.goals.join('；')}</p><p>结束约定：{s.endingConditions.join('；') || '由用户结束或导演确认结束'}</p><p>回合上限 {s.maxTurns} · 回复预算 {s.directorBudget}</p>{s.relationshipRules.map(r => <p key={r.ruleKey}>{r.label}：{r.reason}</p>)}</article>)}</> : <p>当前版本为纯文字角色聊天，不含图片或音频。生成的人物与场景内容可在对应页查看。</p>}</section>;
}
