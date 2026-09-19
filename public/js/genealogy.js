// FINVORA Interactive Sovereign Genealogy Network Visualizer
document.addEventListener('DOMContentLoaded', () => {
  const treeContainer = document.getElementById('interactive-tree-root');
  if (!treeContainer) return;

  treeContainer.innerHTML = `
    <div style="padding: 3rem; text-align: center;">
      <div class="pulse-dot" style="margin-bottom: 1rem;"></div>
      <div class="text-secondary" style="font-size: 0.95rem;">Traversing sovereign node hierarchy...</div>
    </div>
  `;

  fetch('/api/v1/genealogy/tree')
    .then(res => res.json())
    .then(json => {
      if (!json.success || !json.data) {
        treeContainer.innerHTML = '<div class="text-muted" style="padding: 2.5rem;">No downline network records found. Share your referral link to build your team.</div>';
        return;
      }

      treeContainer.innerHTML = '';
      const treeWrapper = document.createElement('div');
      treeWrapper.className = 'tree-wrapper';
      treeWrapper.style.display = 'inline-flex';
      treeWrapper.style.flexDirection = 'column';
      treeWrapper.style.alignItems = 'center';
      treeWrapper.style.gap = '1.8rem';
      treeWrapper.style.minWidth = '100%';

      renderNode(json.data, treeWrapper, 1);
      treeContainer.appendChild(treeWrapper);
    })
    .catch(err => {
      console.error('Tree load error:', err);
      treeContainer.innerHTML = '<div class="text-error" style="padding: 2rem;">Failed to load genealogy network.</div>';
    });

  function renderNode(nodeData, parentElement, depth) {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node-item';
    nodeEl.style.display = 'flex';
    nodeEl.style.flexDirection = 'column';
    nodeEl.style.alignItems = 'center';
    nodeEl.style.position = 'relative';

    const card = document.createElement('div');
    const isInvested = nodeData.invested > 0;
    card.className = `tree-node ${isInvested ? 'active-user' : ''}`;
    card.style.cursor = nodeData.children && nodeData.children.length > 0 ? 'pointer' : 'default';

    card.innerHTML = `
      <div class="tree-node-avatar">${nodeData.username.charAt(0).toUpperCase()}</div>
      <div class="tree-node-name">${escapeHtml(nodeData.username)}</div>
      <div class="tree-node-code mono">${nodeData.user_code}</div>
      <div style="display: flex; justify-content: center; gap: 0.35rem; margin: 0.35rem 0;">
        <span class="badge ${nodeData.user_type === 'WORKING' ? 'badge-working' : 'badge-investor'}" style="font-size: 0.65rem;">
          ${nodeData.user_type}
        </span>
        <span class="badge ${isInvested ? 'badge-success' : 'badge-warning'}" style="font-size: 0.65rem;">
          ${isInvested ? 'ACTIVE' : 'FREE'}
        </span>
      </div>
      <div class="tree-node-stats mono">
        Package: <strong>$${nodeData.invested.toFixed(0)}</strong>
      </div>
    `;

    nodeEl.appendChild(card);

    if (nodeData.children && nodeData.children.length > 0) {
      // Connecting branch line down from node
      const downLine = document.createElement('div');
      downLine.style.width = '2px';
      downLine.style.height = '24px';
      downLine.style.background = 'linear-gradient(180deg, #37A5A1 0%, #1C88A6 100%)';
      downLine.style.boxShadow = '0 0 8px rgba(55, 165, 161, 0.5)';
      nodeEl.appendChild(downLine);

      const childrenRow = document.createElement('div');
      childrenRow.className = 'tree-children-row';
      childrenRow.style.display = 'flex';
      childrenRow.style.gap = '2rem';
      childrenRow.style.position = 'relative';
      childrenRow.style.paddingTop = '1.25rem';

      // Horizontal bus bar
      const busBar = document.createElement('div');
      busBar.style.position = 'absolute';
      busBar.style.top = '0';
      busBar.style.left = '25%';
      busBar.style.right = '25%';
      busBar.style.height = '2px';
      busBar.style.background = 'linear-gradient(90deg, #1C88A6 0%, #57C19D 50%, #1C88A6 100%)';
      busBar.style.boxShadow = '0 0 8px rgba(87, 193, 157, 0.4)';
      childrenRow.appendChild(busBar);

      nodeData.children.forEach(child => {
        renderNode(child, childrenRow, depth + 1);
      });

      nodeEl.appendChild(childrenRow);
    }

    parentElement.appendChild(nodeEl);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
