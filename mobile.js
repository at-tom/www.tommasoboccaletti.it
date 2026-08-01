const isMobileViewport = () => window.matchMedia('(max-width: 900px)').matches;

let mobileFeedBuilt = false;

if (isMobileViewport()) {
    initMobileFeed();
}

window.addEventListener('resize', () => {
    if (isMobileViewport() && !mobileFeedBuilt) {
        initMobileFeed();
    }
});

async function initMobileFeed() {
    const feed = document.getElementById('mobile-projects-feed');
    if (!feed || mobileFeedBuilt) return;
    mobileFeedBuilt = true;

    let projects;
    try {
        const res = await fetch('projects-data.json');
        projects = await res.json();
    } catch (err) {
        mobileFeedBuilt = false;
        return;
    }

    feed.innerHTML = buildMobileFeedHtml(projects);

    resetGalleryScrollPositions(feed);

    setupArchiveToggle(feed);
    setupMobileNavLinks(feed);
    setupMobileVideoObserver(feed);
    setupMobileLightbox(feed, projects);

    // Hide scroll hint when scrolling down on mobile
    const scrollHint = document.querySelector('.landing-footer .hint-scroll');
    if (scrollHint) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 80) {
                scrollHint.style.display = 'none';
            } else {
                scrollHint.style.display = 'inline-block';
            }
        }, { passive: true });
    }
}

function resetGalleryScrollPositions(feed) {
    const galleries = feed.querySelectorAll('.m-gallery-scroll');
    if (!galleries.length) return;

    const forceZero = () => {
        galleries.forEach((scrollContainer) => {
            scrollContainer.scrollLeft = 0;
        });
    };

    // Immediately, then after layout settles, then once every image/video
    // in the feed has finished loading (late loads can otherwise nudge
    // scrollLeft on some browsers).
    forceZero();
    requestAnimationFrame(() => requestAnimationFrame(forceZero));

    const mediaEls = feed.querySelectorAll('img.m-g-media, video.m-g-media');
    let pending = mediaEls.length;
    if (!pending) return;

    const onOneLoaded = () => {
        pending--;
        if (pending <= 0) forceZero();
    };

    mediaEls.forEach((el) => {
        const isLoaded = el.tagName === 'IMG'
            ? el.complete
            : el.readyState >= 1;
        if (isLoaded) {
            onOneLoaded();
        } else {
            const evt = el.tagName === 'IMG' ? 'load' : 'loadedmetadata';
            el.addEventListener(evt, onOneLoaded, { once: true });
            el.addEventListener('error', onOneLoaded, { once: true });
        }
    });
}

const SEPARATOR_HTML = `<div class="separator" aria-hidden="true"><span>*</span><span>*</span><span>*</span></div>`;

function buildMobileFeedHtml(projects) {
    const main = projects.filter((p) => !p.archive);
    const archived = projects.filter((p) => p.archive);

    let html = '';

    html += main.map((p, idx) => buildMobileProjectHtml(p, false, idx)).join('');

    if (archived.length) {
        html += `<div class="m-archive-sep">${SEPARATOR_HTML}</div>`;
        html += `<button type="button" class="m-archive-toggle" id="m-archive-toggle">See project archive</button>`;
        html += archived.map((p, idx) => buildMobileProjectHtml(p, true, idx)).join('');
    }

    return html;
}

function formatMobileYear(label) {
    return String(label || '').replace(/\s*\/\s*/, '<br>/ ');
}

function buildMobileProjectHtml(p, isArchive = false, index = 0) {
    const yearLabel = p.year || p.years || '';
    const isFirst = !isArchive && index === 0;
    return `
    <section class="m-project${isArchive ? ' m-archive' : ''}" id="m-${p.id}">
        ${SEPARATOR_HTML}
        <div class="m-project-header">
            <span class="m-proj-year">${formatMobileYear(yearLabel)}</span>
            <span class="m-proj-title">${p.title || ''}</span>
        </div>
        <div class="m-project-meta">
            ${buildMobileMetaHtml(p)}
        </div>
        ${buildMobileGalleryHtml(p.gallery, isFirst)}
    </section>`;
}

function buildMobileMetaHtml(p) {
    const type = p.type || '';
    const typeParts = type.split(',').map((s) => s.trim()).filter(Boolean);
    const tag = typeParts[1] || typeParts[0] || '';

    const about = p.about || '';
    const project = p.project || '';
    const projectHtml = `${about}${about && project ? '<span class="m-space"></span>' : ''}${project}`
        .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '<span class="m-space"></span>');

    let html = '';

    if (tag) {
        html += `
        <div class="m-meta-row">
            <div class="m-meta-label">tag</div>
            <div class="m-meta-content">${tag}</div>
        </div>`;
    }

    if (about || project) {
        html += `
        <div class="m-meta-row">
            <div class="m-meta-label">project</div>
            <div class="m-meta-content m-justify">${projectHtml}</div>
        </div>`;
    }

    if (p.team) {
        html += `
        <div class="m-meta-row">
            <div class="m-meta-label">with</div>
            <div class="m-meta-content">${p.team}</div>
        </div>`;
    }

    if (p.links) {
        html += `
        <div class="m-meta-row">
            <div class="m-meta-label">links</div>
            <div class="m-meta-content">${p.links}</div>
        </div>`;
    }

    return html;
}

function buildMobileGalleryHtml(gallery = [], isFirst = false) {
    const items = [];

    gallery.forEach((row) => {
        (row.items || []).forEach((item) => {
            const html = buildMobileGalleryItem(item, isFirst);
            if (html) items.push(html);
        });
    });

    if (!items.length) return '';

    return `<div class="m-gallery-scroll">${items.join('')}</div>`;
}

function buildMobileGalleryItem(item, isFirst = false) {
    if (!item || item.placeholder) return '';

    const path = item.video || item.image;
    if (item.video) {
        return `<video class="m-g-media" data-src="${path}" src="${item.video}" autoplay muted loop playsinline webkit-playsinline></video>`;
    }

    if (item.image) {
        const loadingAttr = isFirst ? 'eager' : 'lazy';
        const priorityAttr = isFirst ? ' fetchpriority="high"' : '';
        return `<img class="m-g-media" data-src="${path}" src="${item.image}" alt="" loading="${loadingAttr}"${priorityAttr} />`;
    }

    return '';
}

function setupArchiveToggle(feed) {
    const toggleBtn = feed.querySelector('#m-archive-toggle');
    if (!toggleBtn) return;

    let open = false;

    toggleBtn.addEventListener('click', () => {
        open = !open;
        toggleBtn.textContent = open ? 'Close project archive' : 'See project archive';
        toggleBtn.classList.toggle('m-open', open);
        feed.querySelectorAll('.m-project.m-archive').forEach((el) => {
            el.classList.toggle('m-show', open);
        });
    });
}

function setupMobileNavLinks(feed) {
    const projectsLink = document.querySelector('a.header-center[href="#projects"]');
    if (projectsLink) {
        projectsLink.addEventListener('click', () => {
            if (!isMobileViewport()) return;
            setTimeout(() => {
                feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 0);
        });
    }

    document.querySelectorAll('a[href="#top-section"]').forEach((a) => {
        a.addEventListener('click', () => {
            if (!isMobileViewport()) return;
            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 0);
        });
    });
}

function setupMobileVideoObserver(feed) {
    const videos = feed.querySelectorAll('video');
    if (!videos.length) return;

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                const video = entry.target;
                if (!entry.isIntersecting) {
                    if (!video.paused) video.pause();
                } else if (video.paused) {
                    video.play().catch(() => { });
                }
            });
        },
        { threshold: 0.15 }
    );

    videos.forEach((v) => observer.observe(v));
}

function setupMobileLightbox(feed, projects) {
    const lightbox = document.getElementById('m-lightbox');
    const header = document.getElementById('m-lightbox-header');
    const content = document.getElementById('m-lightbox-content');
    const closeBtn = document.getElementById('m-lightbox-close');
    if (!lightbox || !content || !closeBtn || !header) return;

    // 1. Gather all media items across all projects in order, tagging each with its project title
    const allMedia = [];
    projects.forEach((proj) => {
        (proj.gallery || []).forEach((row) => {
            (row.items || []).forEach((item) => {
                if (!item || item.placeholder) return;
                item.projectTitle = proj.title;
                allMedia.push(item);
            });
        });
    });

    // 2. Build the DOM content for the lightbox (stacked vertically)
    content.innerHTML = allMedia.map((item) => {
        const path = item.video || item.image;
        const titleEscaped = (item.projectTitle || '').replace(/"/g, '&quot;');
        if (item.video) {
            return `<video class="m-lightbox-item" data-src="${path}" data-project-title="${titleEscaped}" src="${item.video}" loop playsinline muted autoplay></video>`;
        }
        if (item.image) {
            return `<img class="m-lightbox-item" data-src="${path}" data-project-title="${titleEscaped}" src="${item.image}" alt="" />`;
        }
        return '';
    }).join('');

    // Play videos once loaded inside the lightbox
    const lbVideos = content.querySelectorAll('video');
    lbVideos.forEach(v => {
        v.addEventListener('loadedmetadata', () => {
            v.play().catch(() => {});
        });
    });

    // Function to update header title based on which item is currently centered
    let lastCenteredItem = null;
    const updateHeaderOnScroll = () => {
        const items = content.querySelectorAll('.m-lightbox-item');
        const centerY = window.innerHeight / 2;
        let closestItem = null;
        let closestDist = Infinity;

        items.forEach(item => {
            const rect = item.getBoundingClientRect();
            const itemCenter = rect.top + rect.height / 2;
            const dist = Math.abs(itemCenter - centerY);
            if (dist < closestDist) {
                closestDist = dist;
                closestItem = item;
            }
        });

        if (closestItem) {
            header.textContent = closestItem.getAttribute('data-project-title') || '';
            lastCenteredItem = closestItem;
        }
    };

    // Scroll listener on mobile lightbox
    lightbox.addEventListener('scroll', updateHeaderOnScroll);

    // 3. Delegate click handler on feed media items
    feed.addEventListener('click', (e) => {
        const clickedMedia = e.target.closest('.m-g-media');
        if (!clickedMedia) return;

        const targetSrc = clickedMedia.getAttribute('data-src');
        if (!targetSrc) return;

        // Open lightbox
        document.body.classList.add('m-lightbox-open');
        lightbox.classList.add('active');

        // Find the matching element in lightbox
        const targetElement = content.querySelector(`[data-src="${targetSrc}"]`);
        if (targetElement) {
            // Scroll directly to it instantly
            targetElement.scrollIntoView({ block: 'center' });
            // Instantly update header to avoid lag
            header.textContent = targetElement.getAttribute('data-project-title') || '';
            lastCenteredItem = targetElement;
        }
    });

    // 4. Close handler — return to the exact photo/project being viewed
    // in the extended gallery, matching the lightbox's vertical scroll
    // position to the feed's horizontal scroll position, instead of
    // always snapping back to the top (the bee).
    const close = () => {
        const targetSrc = lastCenteredItem ? lastCenteredItem.getAttribute('data-src') : null;

        document.body.classList.remove('m-lightbox-open');
        lightbox.classList.remove('active');
        header.textContent = '';
        // Pause all lightbox videos
        content.querySelectorAll('video').forEach(v => v.pause());

        if (targetSrc) {
            const thumb = feed.querySelector(`.m-g-media[data-src="${CSS.escape(targetSrc)}"]`);
            if (thumb) {
                const project = thumb.closest('.m-project');
                if (project) project.scrollIntoView({ block: 'start' });
                thumb.scrollIntoView({ block: 'nearest', inline: 'start' });
            }
        }
    };

    closeBtn.addEventListener('click', close);
}
