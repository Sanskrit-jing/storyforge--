import { useEffect, useState } from "react";
import type { Project, WorkspaceScope, ProductRelease } from "../../lib/types";
import { db } from "../../lib/db/schema";
import { createProductRuntimeInstanceFromSource } from "../../lib/product/runtime-instances";
import TtrpgRuntimePanel from "./TtrpgRuntimePanel";
import TtrpgCommunityPage from "../../pages/TtrpgCommunityPage";
export default function AuthorPlayer({
  scope,
  project,
  sessionId,
  page,
  onSession,
}: {
  scope: WorkspaceScope | null;
  project?: Project;
  sessionId: number | null;
  page: string;
  onSession: (id: number) => void;
}) {
  const [releases, setReleases] = useState<ProductRelease[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setReleases([]);
    if (scope)
      void db.productReleases
        .where("workId")
        .equals(scope.workId)
        .filter(
          (r) => r.projectId === scope.projectId && r.productType === "ttrpg",
        )
        .toArray()
        .then((v) => {
          if (active) setReleases(v);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [scope]);
  if (!scope || !project)
    return (
      <>
        <section className="lf-paper">
          <h3>开始一场冒险</h3>
          <p>
            可从作品库选择自己的已发布战役，或直接游玩下面的社区作品。每场冒险单独保存，不必先创建世界。
          </p>
        </section>
        <TtrpgCommunityPage embedded />
      </>
    );
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <section className="lf-paper">
        <h3>从战役版本开新团</h3>
        <p>新开团会创建独立存档；已有团局在下方继续。</p>
        {releases.map((r) => (
          <button
            key={r.id}
            className="lf-action"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void createProductRuntimeInstanceFromSource({
                scope,
                source: { kind: "release", productReleaseId: r.id! },
                title: `${r.label} · 新团局`,
              })
                .then((s) => onSession(s.id!))
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            {r.label} · v{r.version} 开新团
          </button>
        ))}
        {!releases.length && (
          <p>尚无已发布版本。已通过检查的制作预览也可从“检查与试玩”进入。</p>
        )}
      </section>
      <div className="ttrpg-runtime">
        <TtrpgRuntimePanel
          key={`${scope.workId}:${sessionId ?? ""}`}
          project={project}
          worldGroupId={null}
          workspaceScope={scope}
          initialSessionId={sessionId}
          authorPanel={
            page === "play"
              ? undefined
              : (page as "inventory" | "tabletop" | "room" | "history")
          }
          onSessionSelected={onSession}
        />
      </div>
    </>
  );
}
