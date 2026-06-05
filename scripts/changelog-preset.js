"use strict";

// Section order in the changelog (Features before Bug Fixes, etc.)
const GROUP_ORDER = [
  "BREAKING CHANGES",
  "Features",
  "Bug Fixes",
  "Performance Improvements",
  "Reverts",
  "Documentation",
  "Code Refactoring",
  "Styles",
  "Tests",
  "Build System",
  "Continuous Integration",
];

async function createPreset() {
  const angularPreset = await require("conventional-changelog-angular")();

  // lerna uses config.conventionalChangelog.writerOpts when present,
  // so we must override it in addition to the top-level writerOpts.
  const customWriterOpts = {
    ...angularPreset.writerOpts,

    // Put Features before Bug Fixes (default is alphabetical)
    commitGroupsSort: (a, b) => {
      const ai = GROUP_ORDER.indexOf(a.title);
      const bi = GROUP_ORDER.indexOf(b.title);
      if (ai === -1 && bi === -1) return a.title.localeCompare(b.title);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    },

    // Preserve git log order (newest first) instead of alphabetical sort
    commitsSort: false,

    // Angular preset transform, patched to not linkify CSS at-rule names
    transform: (commit, context) => {
      let discard = true;
      const issues = [];

      commit.notes.forEach((note) => {
        note.title = "BREAKING CHANGES";
        discard = false;
      });

      if (commit.type === "feat") {
        commit.type = "Features";
      } else if (commit.type === "fix") {
        commit.type = "Bug Fixes";
      } else if (commit.type === "perf") {
        commit.type = "Performance Improvements";
      } else if (commit.type === "revert" || commit.revert) {
        commit.type = "Reverts";
      } else if (discard) {
        return;
      } else if (commit.type === "docs") {
        commit.type = "Documentation";
      } else if (commit.type === "style") {
        commit.type = "Styles";
      } else if (commit.type === "refactor") {
        commit.type = "Code Refactoring";
      } else if (commit.type === "test") {
        commit.type = "Tests";
      } else if (commit.type === "build") {
        commit.type = "Build System";
      } else if (commit.type === "ci") {
        commit.type = "Continuous Integration";
      }

      if (commit.scope === "*") {
        commit.scope = "";
      }

      if (typeof commit.hash === "string") {
        commit.shortHash = commit.hash.substring(0, 7);
      }

      if (typeof commit.subject === "string") {
        let url = context.repository
          ? `${context.host}/${context.owner}/${context.repository}`
          : context.repoUrl;
        if (url) {
          url = `${url}/issues/`;
          commit.subject = commit.subject.replace(/#([0-9]+)/g, (_, issue) => {
            issues.push(issue);
            return `[#${issue}](${url}${issue})`;
          });
        }
        if (context.host) {
          // Do NOT linkify @mentions — commit subjects may contain CSS at-rules
          // (e.g. @page, @footnote) and GitHub usernames are never relevant here
        }
      }

      commit.references = commit.references.filter((reference) => {
        // Only keep references with a closing action keyword (closes/fixes/resolves etc.)
        // References with action: null are plain #number mentions without a keyword.
        if (!reference.action) return false;
        // Deduplicate: skip if already linked in the subject or seen in a prior reference
        if (issues.indexOf(reference.issue) !== -1) return false;
        issues.push(reference.issue);
        return true;
      });

      return commit;
    },
  };

  return {
    ...angularPreset,
    writerOpts: customWriterOpts,
    conventionalChangelog: {
      ...angularPreset.conventionalChangelog,
      writerOpts: customWriterOpts,
    },
  };
}

module.exports = createPreset;
