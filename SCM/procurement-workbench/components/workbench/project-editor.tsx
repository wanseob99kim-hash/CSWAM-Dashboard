import { createProjectDraft } from "@/lib/drafts";
import { getProjectStatus } from "@/lib/format";
import { projectStatuses } from "@/lib/seed-data";
import type { Workbench } from "@/hooks/useWorkbench";

type ProjectEditorProps = {
  wb: Workbench;
};

export function ProjectEditor({ wb }: ProjectEditorProps) {
  const { showProjectForm, setShowProjectForm, editingProjectId, setEditingProjectId, projectDraft, setProjectDraft, saveProject } = wb;

  return (
    <>
      {showProjectForm ? (
        <section className="editor-panel project-editor-panel" aria-label="Add project">
          <div className="section-title">
            <h2>{editingProjectId ? "Edit Project" : "Add Project"}</h2>
          </div>
          <div className="form-grid project-form">
            <label>
              Project name
              <input value={projectDraft.name} onChange={(event) => setProjectDraft({ ...projectDraft, name: event.target.value })} />
            </label>
            <label>
              Code
              <input value={projectDraft.code} onChange={(event) => setProjectDraft({ ...projectDraft, code: event.target.value })} />
            </label>
            <label>
              Phase
              <input value={projectDraft.phase} onChange={(event) => setProjectDraft({ ...projectDraft, phase: event.target.value })} />
            </label>
            <label>
              Plant
              <input value={projectDraft.plant} onChange={(event) => setProjectDraft({ ...projectDraft, plant: event.target.value })} />
            </label>
            <label>
              Production window
              <input placeholder="Aug 05 - Sep 12" value={projectDraft.productionWindow} onChange={(event) => setProjectDraft({ ...projectDraft, productionWindow: event.target.value })} />
            </label>
            <label>
              Budget
              <input type="number" value={projectDraft.budget} onChange={(event) => setProjectDraft({ ...projectDraft, budget: Number(event.target.value) })} />
            </label>
            <label>
              Running status
              <select value={getProjectStatus(projectDraft)} onChange={(event) => setProjectDraft({ ...projectDraft, status: event.target.value })}>
                {projectStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button
                className="secondary-action"
                onClick={() => {
                  setShowProjectForm(false);
                  setEditingProjectId(null);
                  setProjectDraft(createProjectDraft());
                }}
              >
                Cancel
              </button>
              <button className="primary-action" onClick={saveProject}>{editingProjectId ? "Save changes" : "Save project"}</button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
