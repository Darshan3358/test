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
      if (!json.success || !json.data || !json.data.username) {
        treeContainer.innerHTML = '<div class="text-muted" style="padding: 2.5rem; text-align: center;">No downline network records found yet. Share your referral link to build your team.</div>';
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
      treeContainer.innerHTML = '<div class="text-error" style="padding: 2rem; text-align: center;">Failed to load genealogy network.</div>';
    });

  function renderNode(nodeData, parentElement, depth) {
    if (!nodeData) return;

    const nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node-item';
    nodeEl.style.display = 'flex';
    nodeEl.style.flexDirection = 'column';
    nodeEl.style.alignItems = 'center';
    nodeEl.style.position = 'relative';

    const card = document.createElement('div');
    const investedAmt = Number(nodeData.invested || 0);
    const isInvested = investedAmt > 0;
    card.className = `tree-node ${isInvested ? 'active-user' : ''}`;
    card.style.cursor = nodeData.children && nodeData.children.length > 0 ? 'pointer' : 'default';

    const username = nodeData.username || nodeData.user_code || 'User';
    const initial = username ? username.charAt(0).toUpperCase() : 'U';
    const userCode = nodeData.user_code || '';
    const userType = nodeData.user_type || 'ACTIVE';

    card.innerHTML = `
      <div class="tree-node-avatar">${initial}</div>
      <div class="tree-node-name">${escapeHtml(username)}</div>
      <div class="tree-node-code mono">${escapeHtml(userCode)}</div>
      <div style="display: flex; justify-content: center; gap: 0.35rem; margin: 0.35rem 0;">
        <span class="badge ${userType === 'WORKING' ? 'badge-working' : 'badge-investor'}" style="font-size: 0.65rem;">
          ${userType}
        </span>
        <span class="badge ${isInvested ? 'badge-success' : 'badge-warning'}" style="font-size: 0.65rem;">
          ${isInvested ? 'ACTIVE' : 'FREE'}
        </span>
      </div>
      <div class="tree-node-stats mono">
        Package: <strong>$${investedAmt.toFixed(0)}</strong>
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
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
