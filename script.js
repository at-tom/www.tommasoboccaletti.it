import * as THREE from 'https://esm.sh/three@0.160.0';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

/* =========================================================
   0. STATO GLOBALE DI FASE
   ========================================================= */
const wrapper = document.getElementById('snap-wrapper');
const projectsRight = document.getElementById('projects-right');
let phase = 'landing';
let isTransitioning = false;

const TRANSITION_DURATION = 900;

const isDesktop = window.matchMedia('(min-width: 901px)').matches;

const BEE_CONFIG = {
    desktop: {
        scale: 12,
        y: -7
    },
    mobile: {
        scale: 18,
        y: -10
    },
    about: {
        scale: 2.2,
        y: 0
    }
};

const isAboutPage = !!document.getElementById('canvas-container-about');

let scene, camera, renderer, beeModel, mixer, rafId;
let baseY = isAboutPage ? BEE_CONFIG.about.y : (window.innerWidth <= 900 ? BEE_CONFIG.mobile.y : BEE_CONFIG.desktop.y);
let baseX = 0;
const clock = new THREE.Clock();
const mouse = { x: 0, y: 0 };
const pixelScale = 1.6;
let flyAwayStart = null;
let flyAwayTimeout = null;
const FLY_DURATION = 2600;
let beeDisposed = false;
const desiredScale = isAboutPage ? BEE_CONFIG.about.scale : (window.innerWidth <= 900 ? BEE_CONFIG.mobile.scale : BEE_CONFIG.desktop.scale);

const navEntries = performance.getEntriesByType('navigation');
const isReload = navEntries.length > 0 && navEntries[0].type === 'reload';
const hasVisited = !isReload && (sessionStorage.getItem('visited_index') === 'true');

let beeLoaded = false;
let imagesLoaded = false;
let minLoadingTimeElapsed = false;

// Preload the first three Emergentissimi images programmatically to wait for them
const preloadImages = [
    'ASSETS/progetti/emergentissimi_0.webp',
    'ASSETS/progetti/emergentissimi_1.webp',
    'ASSETS/progetti/emergentissimi_2.webp'
];
let loadedCount = 0;
preloadImages.forEach(src => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
        loadedCount++;
        if (loadedCount === preloadImages.length) {
            imagesLoaded = true;
            tryRevealSite();
        }
    };
    img.onerror = () => {
        // Fallback in case of network issue
        loadedCount++;
        if (loadedCount === preloadImages.length) {
            imagesLoaded = true;
            tryRevealSite();
        }
    };
});

function tryRevealSite() {
    if (beeLoaded && imagesLoaded && minLoadingTimeElapsed) revealSite();
}

// Bzzz initial loader minimum time
setTimeout(() => {
    minLoadingTimeElapsed = true;
    tryRevealSite();
}, 2000); // 2 seconds minimum Bzzz duration

function revealSite() {
    const loadingScreen = document.getElementById('loading-screen');
    if (hasVisited) {
        if (loadingScreen) loadingScreen.remove();
        showElementsInstantly();
    } else {
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.remove();
                setTimeout(flyInElements, 200);
            }, 500);
        } else {
            flyInElements();
        }
        sessionStorage.setItem('visited_index', 'true');
    }
}

function showElementsInstantly() {
    const els = document.querySelectorAll('[data-fly]');
    els.forEach((el) => {
        el.style.transition = 'none';
        el.style.transform = 'none';
        el.style.opacity = '1';
    });
}

function flyInElements() {
    const els = document.querySelectorAll('[data-fly]');
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const dx = cx - (rect.left + rect.width / 2);
        const dy = cy - (rect.top + rect.height / 2);
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
        el.style.opacity = '0';
    });

    void document.body.offsetHeight;

    els.forEach((el, i) => {
        const delay = i * 0.13;
        el.style.transition = `transform 1.5s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, opacity 1.1s ease ${delay}s`;
        el.style.transform = 'translate(0, 0) scale(1)';
        el.style.opacity = '1';
    });
}

let updateActiveByScroll;

const bzzSound = new Audio('/ASSETS/bzz.mp3');
bzzSound.volume = 0.5;
let mouseClientX = -9999;
let mouseClientY = -9999;
let isNearBee = false;
const PROXIMITY_RADIUS = 190;

const canvasContainer = document.getElementById('canvas-container') || document.getElementById('canvas-container-about');

if (canvasContainer) {
    initThreeJS();
    rafId = requestAnimationFrame(animateThreeJS);
}

function initThreeJS() {
    scene = new THREE.Scene();
    if (!isAboutPage) {
        scene.background = new THREE.Color(0xffffff);
    }

    camera = new THREE.PerspectiveCamera(
        45,
        canvasContainer.clientWidth / canvasContainer.clientHeight,
        1,
        1000
    );
    camera.position.set(0, 0, isAboutPage ? 50 : (window.innerWidth <= 900 ? 66 : 50));

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(
        canvasContainer.clientWidth / pixelScale,
        canvasContainer.clientHeight / pixelScale,
        false
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    canvasContainer.appendChild(renderer.domElement);

    if (isAboutPage) {
        renderer.setClearColor(0x000000, 0);
    }

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    const light1 = new THREE.DirectionalLight(0xffffff, 1.5);
    light1.position.set(5, 20, 10);
    scene.add(light1);

    const light2 = new THREE.DirectionalLight(0xffffff, 0.8);
    light2.position.set(-10, 5, -10);
    scene.add(light2);

    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';

    loader.load('ASSETS/ape.glb', (glb) => {
        beeModel = glb.scene;

        const box = new THREE.Box3().setFromObject(beeModel);
        const center = box.getCenter(new THREE.Vector3());

        beeModel.children.forEach((child) => {
            if (child.isMesh) {
                child.geometry.translate(-center.x, -center.y, -center.z);
                child.geometry.rotateY(Math.PI / 2);
            }
        });

        beeModel.scale.set(desiredScale, desiredScale, desiredScale);
        beeModel.position.set(baseX, baseY, 0);

        beeModel.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.roughness = 0.8;
                child.material.metalness = 0.0;
                child.material.needsUpdate = true;
            }
        });

        scene.add(beeModel);

        if (glb.animations && glb.animations.length > 0) {
            mixer = new THREE.AnimationMixer(beeModel);
            glb.animations.forEach((clip) => mixer.clipAction(clip).play());
        }

        beeLoaded = true;
        tryRevealSite();
    }, undefined, () => {
        beeLoaded = true;
        tryRevealSite();
    });

    window.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        mouseClientX = e.clientX;
        mouseClientY = e.clientY;
    });

    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        if (!renderer || !camera) return;
        const currentWidth = window.innerWidth;
        const isMobile = window.innerWidth <= 900;
        
        // On mobile, ignore resize triggers caused by height changes (e.g. browser bar hiding)
        if (isMobile && currentWidth === lastWidth) {
            return;
        }
        lastWidth = currentWidth;

        baseY = isAboutPage ? BEE_CONFIG.about.y : (isMobile ? BEE_CONFIG.mobile.y : BEE_CONFIG.desktop.y);
        const scale = isAboutPage ? BEE_CONFIG.about.scale : (isMobile ? BEE_CONFIG.mobile.scale : BEE_CONFIG.desktop.scale);
        if (beeModel) {
            beeModel.scale.set(scale, scale, scale);
            beeModel.position.set(baseX, baseY, 0);
        }
        camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(
            canvasContainer.clientWidth / pixelScale,
            canvasContainer.clientHeight / pixelScale,
            false
        );
    });
}

function animateThreeJS() {
    rafId = requestAnimationFrame(animateThreeJS);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (beeModel) {
        const t = clock.elapsedTime;
        const idleX = Math.sin(t * 0.6) * 1.4;
        const idleY = Math.cos(t * 0.5) * 0.9;
        const idleZ = Math.sin(t * 0.35) * 2.2;

        if (isAboutPage) {
            const vFOV = THREE.MathUtils.degToRad(camera.fov);
            const visibleHeight = 2 * Math.tan(vFOV / 2) * camera.position.z;
            const visibleWidth = visibleHeight * camera.aspect;

            const targetX = mouse.x * (visibleWidth / 2);
            const targetY = mouse.y * (visibleHeight / 2);

            const floatX = Math.sin(t * 1.5) * 0.4;
            const floatY = Math.cos(t * 1.2) * 0.3;

            beeModel.position.x += (targetX + floatX - beeModel.position.x) * 0.05;
            beeModel.position.y += (targetY + floatY - beeModel.position.y) * 0.05;
            beeModel.position.z += (Math.sin(t * 0.8) * 1.2 - beeModel.position.z) * 0.04;

            const targetVec = new THREE.Vector3(targetX, targetY, 0);

            if (beeModel.position.distanceTo(targetVec) > 0.5) {
                const dummy = new THREE.Object3D();
                dummy.position.copy(beeModel.position);
                dummy.lookAt(targetVec);

                beeModel.quaternion.slerp(dummy.quaternion, 0.08);
            }
        } else if (window.innerWidth <= 900) {
            beeModel.rotation.y = t * 0.55;
            beeModel.rotation.x = Math.sin(t * 0.3) * 0.15;

            beeModel.position.x = baseX + idleX * 0.5;
            beeModel.position.y = baseY + idleY * 0.5;
            beeModel.position.z = idleZ * 0.5;
        } else {
            const targetRotY = mouse.x * 1.1 + Math.sin(t * 0.4) * 0.06;
            const targetRotX = -mouse.y * 0.6 + Math.cos(t * 0.3) * 0.04;
            beeModel.rotation.y += (targetRotY - beeModel.rotation.y) * 0.18;
            beeModel.rotation.x += (targetRotX - beeModel.rotation.x) * 0.18;

            const moveRangeX = 11;
            const moveRangeY = 6;
            const targetX = baseX + mouse.x * moveRangeX + idleX;
            const targetY = baseY + mouse.y * moveRangeY + idleY;
            const targetZ = idleZ;
            beeModel.position.x += (targetX - beeModel.position.x) * 0.08;
            beeModel.position.y += (targetY - beeModel.position.y) * 0.08;
            beeModel.position.z += (targetZ - beeModel.position.z) * 0.05;

            if (flyAwayStart === null) {
                const screenPos = beeModel.position.clone().project(camera);
                const rect = canvasContainer.getBoundingClientRect();
                const beePixelX = rect.left + (screenPos.x * 0.5 + 0.5) * rect.width;
                const beePixelY = rect.top + (-screenPos.y * 0.5 + 0.5) * rect.height;
                const dist = Math.hypot(mouseClientX - beePixelX, mouseClientY - beePixelY);

                if (dist < PROXIMITY_RADIUS && !isNearBee) {
                    isNearBee = true;
                    bzzSound.currentTime = 0;
                    bzzSound.play().catch(() => { });
                    if (phase === 'landing') showBeeTooltip();
                } else if (dist >= PROXIMITY_RADIUS && isNearBee) {
                    isNearBee = false;
                    if (phase === 'landing') hideBeeTooltip();
                }

                // Auto-collect flowers near the bee
                if (phase === 'landing') checkFlowerProximity(beePixelX, beePixelY);
            }
        }
    }

    if (renderer && scene && camera) renderer.render(scene, camera);
}

function startFlyAway() {
    if (flyAwayStart !== null || !beeModel) return;
    flyAwayStart = performance.now();
    flyAwayTimeout = setTimeout(() => {
        // Suspend rendering instead of full disposal to keep GLB in memory
        cancelAnimationFrame(rafId);
    }, TRANSITION_DURATION);
}

function goToProjects() {
    if (phase === 'projects') return;
    phase = 'projects';
    isTransitioning = true;

    startFlyAway();
    wrapper.classList.add('show-projects');

    setTimeout(() => {
        isTransitioning = false;
        updateActiveByScroll();
    }, TRANSITION_DURATION);
}

function goToLanding() {
    if (phase === 'landing') return;
    phase = 'landing';
    isTransitioning = true;

    // Ensure elements are instantly visible (no repeated fly-in animation)
    showElementsInstantly();

    wrapper.classList.remove('show-projects');

    if (flyAwayTimeout) {
        clearTimeout(flyAwayTimeout);
        flyAwayTimeout = null;
    }
    flyAwayStart = null;

    // Simply resume the animation loop with the existing model
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(animateThreeJS);

    setTimeout(() => {
        isTransitioning = false;
    }, TRANSITION_DURATION);
}

document.querySelectorAll('a[href="#projects"]').forEach((a) => {
    a.addEventListener('click', (e) => {
        e.preventDefault();
        goToProjects();
    });
});

document.addEventListener('click', (e) => {
    const topLink = e.target.closest('a[href="#top-section"]');
    if (topLink) {
        if (window.innerWidth > 900) {
            e.preventDefault();
            goToLanding();
        } else {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
});

const LANDING_TRIGGER_THRESHOLD = 180;
let wheelAccum = 0;
let wheelDecayTimeout = null;

let photoScrollTarget = null;
function photoScrollLoop() {
    if (photoScrollTarget !== null && projectsRight) {
        const current = projectsRight.scrollTop;
        const diff = photoScrollTarget - current;
        if (Math.abs(diff) < 0.5) {
            projectsRight.scrollTop = photoScrollTarget;
            photoScrollTarget = null;
        } else {
            projectsRight.scrollTop = current + diff * 0.35;
        }
    }
    requestAnimationFrame(photoScrollLoop);
}
requestAnimationFrame(photoScrollLoop);

function pushPhotoScroll(delta) {
    const maxScroll = projectsRight.scrollHeight - projectsRight.clientHeight;
    const base = photoScrollTarget !== null ? photoScrollTarget : projectsRight.scrollTop;
    photoScrollTarget = Math.max(0, Math.min(maxScroll, base + delta));
}

if (isDesktop) {
    window.addEventListener(
        'wheel',
        (e) => {
            if (isTransitioning) {
                e.preventDefault();
                return;
            }

            if (phase === 'landing') {
                if (e.deltaY > 0) {
                    wheelAccum += e.deltaY;
                    clearTimeout(wheelDecayTimeout);
                    wheelDecayTimeout = setTimeout(() => { wheelAccum = 0; }, 400);
                    if (wheelAccum >= LANDING_TRIGGER_THRESHOLD) {
                        wheelAccum = 0;
                        goToProjects();
                    }
                }
                return;
            }
            e.preventDefault();
            pushPhotoScroll(e.deltaY * 1.4);
        },
        { passive: false }
    );

    let touchStartY = null;
    window.addEventListener(
        'touchstart',
        (e) => { touchStartY = e.touches[0].clientY; },
        { passive: true }
    );
    window.addEventListener(
        'touchmove',
        (e) => {
            if (touchStartY === null) return;

            if (isTransitioning) {
                e.preventDefault();
                return;
            }

            const currentY = e.touches[0].clientY;
            const deltaY = touchStartY - currentY;

            if (phase === 'landing') {
                if (deltaY > 60) goToProjects();
                return;
            }
            e.preventDefault();
            pushPhotoScroll(deltaY * 1.4);
            touchStartY = currentY;
        },
        { passive: false }
    );
} else {
    document.body.style.overflow = 'auto';
}


const BADGE_ICONS = {
    instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" />
    </svg>`,
    web: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
    </svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3v12" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="5" y1="21" x2="19" y2="21" />
    </svg>`
};

function buildBadge(badge) {
    if (!badge || !BADGE_ICONS[badge.icon]) return '';
    const downloadAttr = badge.download ? 'download' : '';
    const target = badge.download ? '' : 'target="_blank" rel="noopener"';
    return `<a class="g-badge" href="${badge.href}" ${target} ${downloadAttr} data-icon="${badge.icon}" aria-label="Apri">${BADGE_ICONS[badge.icon]}</a>`;
}
function buildGItem(item) {
    if (item.placeholder) {
        return `<div class="g-item placeholder-fill"></div>`;
    }
    const badgeHtml = buildBadge(item.badge);
    const captionAttr = item.caption ? ` data-caption="${item.caption.replace(/"/g, '&quot;')}"` : '';
    const itemStyle = item.style ? ` style="${item.style}"` : '';

    if (item.video) {
        if (item.controls) {
            return `
            <div class="g-item" ${captionAttr}>
                <video class="g-video custom-controlled" src="${item.video}" loop playsinline${itemStyle}></video>
                <button class="v-central-play" aria-label="Play Video">
                    <svg class="icon-central-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                </button>
                <div class="video-controls">
                    <button class="v-ctrl v-play" aria-label="Play/Pause">
                        <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        <svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                    </button>
                    <button class="v-ctrl v-mute" aria-label="Mute/Unmute">
                        <svg class="icon-unmuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        <svg class="icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                    </button>
                </div>
                ${badgeHtml}
            </div>`;
        } else {
            return `
            <div class="g-item" ${captionAttr}>
                <video class="g-video" src="${item.video}" autoplay muted loop playsinline webkit-playsinline${itemStyle}></video>
                ${badgeHtml}
            </div>`;
        }
    }

    if (item.image) {
        return `<div class="g-item" style="background-image:url('${item.image}');${item.style || ''}"${captionAttr}>${badgeHtml}</div>`;
    }
    return `<div class="g-item" style="background-color:${item.color};${item.style || ''}"${captionAttr}>${badgeHtml}</div>`;
}
function buildGalleryHtml(gallery = []) {
    return `<div class="gallery-col">${gallery.map(row => `
        <div class="g-row ${row.row}">
            ${row.items.map(buildGItem).join('')}
        </div>`).join('')}</div>`;
}

function buildProjectListHtml(projects) {
    const main = projects.filter(p => !p.archive);
    const archived = projects.filter(p => p.archive);

    const rowHtml = (p) => `
        <div class="proj-row${p.archive ? ' archive-item' : ''}" data-target="${p.id}" data-list-index="${p.listIndex}">
            <span class="proj-year">${p.year}</span>
            <span class="proj-title">${p.title}</span>
        </div>`;

    let html = main.map(rowHtml).join('');

    if (archived.length) {
        html += `
        <div class="archive-toggle" id="archive-toggle">
            <span class="proj-title"></span>
            <div class="archive-text-wrapper">
                <span class="archive-spacer"></span>
                <span class="proj-year archive-text" id="archive-text">See project archive</span>
            </div>
        </div>`;
        html += archived.map(rowHtml).join('');
    }

    return html;
}

function buildProjectBlockHtml(p) {
    return `
        <article class="project-block${p.placeholder ? ' placeholder' : ''}${p.archive ? ' archive-item' : ''}"
            id="${p.id}" data-index="${p.listIndex}" data-title="${p.title}" data-years="${p.years || '—'}"
            data-about="${(p.about || '').replace(/"/g, '&quot;')}"
            data-project="${(p.project || '').replace(/"/g, '&quot;')}"
            data-team="${(p.team || '').replace(/"/g, '&quot;')}"
            data-type="${(p.type || '').replace(/"/g, '&quot;')}"
            data-links="${(p.links || '').replace(/"/g, '&quot;')}">
            ${buildGalleryHtml(p.gallery)}
        </article>`;
}

function getBgUrl(el) {
    const bg = el.style.backgroundImage;
    if (!bg || bg === 'none') return null;
    return bg.replace(/url\(['"]?(.*?)['"]?\)/i, '$1');
}

function adjustRowAspectRatios() {
    const rows = document.querySelectorAll('.g-row');
    rows.forEach(row => {
        const items = row.querySelectorAll('.g-item');
        if (items.length === 0) return;

        if (row.classList.contains('row-solo-full')) {
            const item = items[0];
            const videoEl = item.querySelector('video');

            const applySoloRatio = (ratio) => {
                if (ratio) {
                    row.style.aspectRatio = ratio.toString();
                    item.style.backgroundSize = 'cover';
                }
            };

            if (videoEl) {
                const handleVideo = () => {
                    const ratio = videoEl.videoWidth / videoEl.videoHeight;
                    applySoloRatio(ratio);
                };
                if (videoEl.readyState >= 1) {
                    handleVideo();
                } else {
                    videoEl.addEventListener('loadedmetadata', handleVideo);
                }
            } else {
                const bgUrl = getBgUrl(item);
                if (!bgUrl) return;
                const img = new Image();
                img.src = bgUrl;
                img.onload = () => {
                    const ratio = img.naturalWidth / img.naturalHeight;
                    applySoloRatio(ratio);
                };
            }
        } else if (row.classList.contains('row-doppia-full') || row.classList.contains('row-tripla-full')) {
            let loadedCount = 0;
            const ratios = new Array(items.length).fill(null);

            const checkAndApply = () => {
                loadedCount++;
                if (loadedCount === items.length) {
                    let maxRatio = 0;
                    ratios.forEach(r => {
                        if (r && r > maxRatio) maxRatio = r;
                    });

                    if (maxRatio > 0) {
                        items.forEach((item, idx) => {
                            item.style.aspectRatio = maxRatio.toString();

                            const itemRatio = ratios[idx];
                            if (itemRatio) {
                                if (Math.abs(itemRatio - maxRatio) < 0.01) {
                                    item.style.backgroundSize = 'contain';
                                    item.style.backgroundRepeat = 'no-repeat';
                                    item.style.backgroundPosition = 'center';
                                } else {
                                    item.style.backgroundSize = 'cover';
                                }
                            }
                        });
                    }
                }
            };

            items.forEach((item, idx) => {
                const videoEl = item.querySelector('video');
                if (videoEl) {
                    const handleVideo = () => {
                        const ratio = videoEl.videoWidth / videoEl.videoHeight;
                        if (ratio) ratios[idx] = ratio;
                        checkAndApply();
                    };
                    if (videoEl.readyState >= 1) {
                        handleVideo();
                    } else {
                        videoEl.addEventListener('loadedmetadata', handleVideo);
                        videoEl.addEventListener('error', checkAndApply);
                    }
                } else {
                    const bgUrl = getBgUrl(item);
                    if (!bgUrl) {
                        checkAndApply();
                        return;
                    }
                    const img = new Image();
                    img.src = bgUrl;
                    img.onload = () => {
                        const ratio = img.naturalWidth / img.naturalHeight;
                        if (ratio) ratios[idx] = ratio;
                        checkAndApply();
                    };
                    img.onerror = checkAndApply;
                }
            });
        }
    });
}

async function loadProjects() {
    const listContainer = document.getElementById('projects-list');
    const blocksContainer = document.getElementById('projects-right');
    if (!listContainer || !blocksContainer) return;

    const res = await fetch('projects-data.json');
    const projects = await res.json();
    projects.forEach((p, i) => { p.listIndex = i; });

    listContainer.innerHTML = buildProjectListHtml(projects);
    blocksContainer.innerHTML = projects.map(buildProjectBlockHtml).join('');

    initProjectsUI();
    adjustRowAspectRatios();
    setupVideoIntersectionObserver();
}

function setupVideoIntersectionObserver() {
    const videos = document.querySelectorAll('video');
    if (!videos.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            const isControlled = video.classList.contains('custom-controlled');

            if (!entry.isIntersecting) {
                if (!video.paused) {
                    video.pause();
                    if (isControlled) {
                        const itemBlock = video.closest('.g-item');
                        if (itemBlock) {
                            const pBtn = itemBlock.querySelector('.v-play');
                            const cPlayBtn = itemBlock.querySelector('.v-central-play');
                            if (pBtn) {
                                const iconPlay = pBtn.querySelector('.icon-play');
                                const iconPause = pBtn.querySelector('.icon-pause');
                                if (iconPlay) iconPlay.style.display = 'block';
                                if (iconPause) iconPause.style.display = 'none';
                            }
                            if (cPlayBtn) {
                                cPlayBtn.classList.remove('playing');
                            }
                        }
                    }
                }
            } else {
                if (video.hasAttribute('autoplay') && video.paused) {
                    video.muted = true;
                    video.play().catch(err => {
                        console.log("Autoplay prevented:", err);
                    });
                }
            }
        });
    }, {
        threshold: 0.1
    });

    videos.forEach(video => observer.observe(video));
}

function initProjectsUI() {
    const listRows = document.querySelectorAll('.proj-row');
    const metaContainer = document.getElementById('projects-meta');
    const projectBlocks = document.querySelectorAll('.project-block');
    let currentActiveIndex = -1;

    const archiveToggle = document.getElementById('archive-toggle');
    const archiveText = document.getElementById('archive-text');
    const archiveItems = document.querySelectorAll('.archive-item');
    let archiveOpen = false;

    if (archiveToggle) {
        archiveToggle.addEventListener('click', () => {
            archiveOpen = !archiveOpen;

            if (archiveOpen) {
                archiveToggle.classList.add('archive-open');
                archiveText.textContent = "Close project archive";
                archiveItems.forEach(item => item.classList.add('show-archive'));
            } else {
                archiveToggle.classList.remove('archive-open');
                archiveText.textContent = "See project archive";
                archiveItems.forEach(item => item.classList.remove('show-archive'));
            }

            setTimeout(updateActiveByScroll, 50);
        });
    }

    function renderMeta(block) {
        const about = block.dataset.about || '';
        const project = block.dataset.project || '';
        const team = block.dataset.team || '';
        const type = block.dataset.type || '';
        const links = block.dataset.links || '';

        const typeParts = type.split(',').map(s => s.trim());
        const sidebarTag = typeParts[1] || typeParts[0] || '';

        const projectHtml = `${about}${about && project ? '<span class="p-space"></span>' : ''}${project}`
            .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '<span class="p-space"></span>');

        let html = `<div class="meta-fade" style="display:flex; flex-direction:column; gap:inherit;">`;

        if (sidebarTag) {
            html += `
            <div class="meta-row">
                <div class="meta-label">tag</div>
                <div class="meta-content no-justify">${sidebarTag}</div>
            </div>`;
        }

        if (about || project) {
            html += `
            <div class="meta-row">
                <div class="meta-label">project</div>
                <div class="meta-content">${projectHtml}</div>
            </div>`;
        }

        if (team) {
            html += `
            <div class="meta-row">
                <div class="meta-label">with</div>
                <div class="meta-content no-justify">${team}</div>
            </div>`;
        }

        if (links) {
            html += `
            <div class="meta-row">
                <div class="meta-label">links</div>
                <div class="meta-content no-justify">${links}</div>
            </div>`;
        }

        html += `</div>`;
        metaContainer.innerHTML = html;
    }

    function updateLightboxHeader(block) {
        const lbTitle = document.getElementById('lb-title');
        if (!lbTitle || !block) return;
        lbTitle.innerHTML = block.dataset.title || '';
    }

    function setActive(index) {
        if (index === currentActiveIndex) return;
        currentActiveIndex = index;

        listRows.forEach((row) => {
            row.classList.toggle('active', Number(row.dataset.listIndex) === index);
        });
        renderMeta(projectBlocks[index]);
        updateLightboxHeader(projectBlocks[index]);
    }

    updateActiveByScroll = function() {
        if (!projectBlocks.length) return;

        let centerY;
        if (window.innerWidth <= 900) {
            centerY = window.innerHeight / 2;
        } else {
            const containerRect = projectsRight.getBoundingClientRect();
            centerY = containerRect.top + containerRect.height / 2;
        }

        let activeIndex = -1;

        for (let i = 0; i < projectBlocks.length; i++) {
            const block = projectBlocks[i];
            const r = block.getBoundingClientRect();
            if (r.height === 0) continue;

            if (r.top <= centerY && r.bottom >= centerY) {
                activeIndex = i;
                break;
            }
        }

        if (activeIndex === -1) {
            let closestIndex = 0;
            let closestDist = Infinity;
            projectBlocks.forEach((block, i) => {
                const r = block.getBoundingClientRect();
                if (r.height === 0) return;
                const blockCenter = r.top + r.height / 2;
                const dist = Math.abs(blockCenter - centerY);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestIndex = i;
                }
            });
            activeIndex = closestIndex;
        }

        setActive(activeIndex);
    }

    if (projectBlocks.length) {
        setActive(0);

        listRows.forEach((row) => {
            row.addEventListener('click', () => {
                const target = document.getElementById(row.dataset.target);
                if (target) {
                    if (window.innerWidth > 900 && projectsRight) {
                        const topPos = target.offsetTop;
                        photoScrollTarget = topPos;
                    } else {
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        });

        let ticking = false;
        const scrollContainer = (window.innerWidth > 900) ? projectsRight : window;
        scrollContainer.addEventListener('scroll', () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(() => {
                    updateActiveByScroll();
                    ticking = false;
                });
            }
        });
    }
}

const lightboxCloseBtn = document.getElementById('lightbox-close');

function getCenteredGItem() {
    if (!projectsRight) return null;
    const items = projectsRight.querySelectorAll('.g-item');
    const containerRect = projectsRight.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;

    let closestItem = null;
    let closestDist = Infinity;

    items.forEach((item) => {
        const rect = item.getBoundingClientRect();
        if (rect.height === 0) return;
        const itemCenter = rect.top + rect.height / 2;
        const dist = Math.abs(itemCenter - centerY);
        if (dist < closestDist) {
            closestDist = dist;
            closestItem = item;
        }
    });

    return closestItem;
}

function scrollGItemToCenter(item, smooth = false) {
    if (!item || !projectsRight) return;
    const containerRect = projectsRight.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const currentScroll = projectsRight.scrollTop;
    const delta = (itemRect.top + itemRect.height / 2) - (containerRect.top + containerRect.height / 2);

    projectsRight.scrollTo({
        top: currentScroll + delta,
        behavior: smooth ? 'smooth' : 'instant'
    });
}

/**
 * Returns the scrollTop value needed to center `item` inside `container`.
 * Works by combining getBoundingClientRect (viewport-relative, layout-accurate)
 * with the current scrollTop to get the item's absolute position in the scroll content.
 */
function scrollTopToCenterItem(item, container) {
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    // item's top edge measured from the start of the scrollable content
    const itemAbsTop = itemRect.top - containerRect.top + container.scrollTop;
    return Math.max(0, itemAbsTop + itemRect.height / 2 - container.clientHeight / 2);
}

function openLightbox(targetItem) {
    // Kill any in-flight inertial scroll (photoScrollLoop) so it can't
    // overwrite the scrollTop we're about to set on the next frames.
    photoScrollTarget = null;

    projectsRight.classList.add('lightbox-mode');
    document.body.classList.add('lightbox-open');

    if (targetItem) {
        // Double rAF — wait for the browser to fully reflow the lightbox layout,
        // then center the clicked item using getBoundingClientRect.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                photoScrollTarget = null;
                projectsRight.scrollTop = scrollTopToCenterItem(targetItem, projectsRight);
            });
        });
    }
}

function closeLightbox() {
    if (!projectsRight) return;

    // Kill any in-flight inertial scroll before we start measuring/centering.
    photoScrollTarget = null;

    // 1. Find which item is centered while still in lightbox layout
    const centeredItem = getCenteredGItem();

    // 2. Switch back to normal layout
    projectsRight.classList.remove('lightbox-mode');
    document.body.classList.remove('lightbox-open');

    if (centeredItem) {
        // 3. Double rAF — wait for the browser to fully reflow the normal layout,
        //    then re-measure with getBoundingClientRect and center the same item.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                photoScrollTarget = null;
                projectsRight.scrollTop = scrollTopToCenterItem(centeredItem, projectsRight);
                updateActiveByScroll();
            });
        });
    } else {
        requestAnimationFrame(() => updateActiveByScroll());
    }
}

if (projectsRight) {
    projectsRight.addEventListener('click', (e) => {
        if (e.target.closest('.g-badge')) return;

        const playBtn = e.target.closest('.v-play');
        const centralPlayBtn = e.target.closest('.v-central-play');
        const customVideo = e.target.closest('.custom-controlled');

        if (playBtn || centralPlayBtn || (customVideo && projectsRight.classList.contains('lightbox-mode'))) {
            const activeElem = playBtn || centralPlayBtn || customVideo;
            const itemBlock = activeElem.closest('.g-item');
            const video = itemBlock.querySelector('video');
            const pBtn = itemBlock.querySelector('.v-play');
            const cPlayBtn = itemBlock.querySelector('.v-central-play');
            const iconPlay = pBtn.querySelector('.icon-play');
            const iconPause = pBtn.querySelector('.icon-pause');

            if (video.paused) {
                video.play();
                iconPlay.style.display = 'none';
                iconPause.style.display = 'block';
                if (cPlayBtn) {
                    cPlayBtn.classList.add('playing');
                }
            } else {
                video.pause();
                iconPlay.style.display = 'block';
                iconPause.style.display = 'none';
                if (cPlayBtn) {
                    cPlayBtn.classList.remove('playing');
                }
            }
            return;
        }

        const muteBtn = e.target.closest('.v-mute');
        if (muteBtn) {
            const video = muteBtn.closest('.g-item').querySelector('video');
            const iconUnmuted = muteBtn.querySelector('.icon-unmuted');
            const iconMuted = muteBtn.querySelector('.icon-muted');
            video.muted = !video.muted;
            if (video.muted) {
                iconUnmuted.style.display = 'none';
                iconMuted.style.display = 'block';
            } else {
                iconUnmuted.style.display = 'block';
                iconMuted.style.display = 'none';
            }
            return;
        }

        const item = e.target.closest('.g-item');
        if (!item) return;

        if (!projectsRight.classList.contains('lightbox-mode')) {
            openLightbox(item);
        } else {
            closeLightbox();
        }
    });
}

if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener('click', closeLightbox);
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
});

// Slightly enlarge the cursor when over the photo column
if (projectsRight && isDesktop) {
    projectsRight.addEventListener('mouseenter', () => {
        document.body.classList.add('cursor-on-gallery');
    });
    projectsRight.addEventListener('mouseleave', () => {
        document.body.classList.remove('cursor-on-gallery');
    });
}

const customCursor = document.getElementById('custom-cursor');
const cursorCaption = document.getElementById('cursor-caption');

if (customCursor && isDesktop) {
    window.addEventListener('mousemove', (e) => {
        customCursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    });

    let lastCaptionText = "";

    document.addEventListener('mouseover', (e) => {
        const item = e.target.closest('.g-item');

        if (item && projectsRight) {
            const captionText = item.dataset.caption;
            if (captionText && captionText !== "undefined" && captionText !== "") {
                if (captionText !== lastCaptionText) {
                    lastCaptionText = captionText;
                    if (document.body.classList.contains('has-caption')) {
                        document.body.classList.remove('has-caption');
                        setTimeout(() => {
                            cursorCaption.textContent = captionText;
                            document.body.classList.add('has-caption');
                        }, 120);
                    } else {
                        cursorCaption.textContent = captionText;
                        document.body.classList.add('has-caption');
                    }
                }
            } else {
                document.body.classList.remove('has-caption');
                lastCaptionText = "";
            }
        } else {
            document.body.classList.remove('has-caption');
            lastCaptionText = "";
        }
    });

    document.addEventListener('mouseout', (e) => {
        const item = e.target.closest('.g-item');
        if (item) {
            const related = e.relatedTarget ? e.relatedTarget.closest('.g-item') : null;
            if (!related) {
                document.body.classList.remove('has-caption');
                lastCaptionText = "";
            } else {
                const relCaption = related.dataset.caption;
                if (!relCaption || relCaption === "undefined" || relCaption === "") {
                    document.body.classList.remove('has-caption');
                    lastCaptionText = "";
                }
            }
        }
    });

    document.addEventListener('mouseleave', () => {
        document.body.classList.remove('has-caption');
        lastCaptionText = "";
    });
}

let hasFedBee = false;
let beeTooltipTimeout = null;

// Persistent flower counter for the session
let flowerCount = parseInt(sessionStorage.getItem('bee_flowers') || '0', 10);

const MILESTONE_MESSAGES = [
    { at: 1,  msg: "gnam!" },
    { at: 3,  msg: "more flowers!!" },
    { at: 5,  msg: "you're so kind :)" },
    { at: 7,  msg: "the bee is full..." },
    { at: 10, msg: "ok ok, I'll stop eating" },
    { at: 15, msg: "bzzzz ♥" },
    { at: 20, msg: "you really like this huh" },
];

function getMilestoneMsg(count) {
    let msg = null;
    for (const m of MILESTONE_MESSAGES) {
        if (count === m.at) { msg = m.msg; break; }
    }
    return msg;
}

function updateBeeScore() {
    const el = document.getElementById('bee-score');
    if (!el) return;
    if (flowerCount === 0) {
        el.classList.remove('visible');
        el.textContent = '';
    } else {
        el.innerHTML = `<img src="ASSETS/flower1.svg" class="bee-score-icon" aria-hidden="true"> ${flowerCount}`;
        el.classList.add('visible');
    }
}

function showBeeTooltip(overrideMsg) {
    clearTimeout(beeTooltipTimeout);
    const footerCenter = document.querySelector('.landing-footer .footer-center');
    const hintFeed = document.querySelector('.landing-footer .hint-feed');
    if (footerCenter && hintFeed) {
        const msg = overrideMsg || (hasFedBee ? "gnam gnam" : "double click to drop a flower for the bee");
        hintFeed.textContent = msg;
        footerCenter.classList.add('bee-hovered');

        beeTooltipTimeout = setTimeout(() => {
            footerCenter.classList.remove('bee-hovered');
        }, 4000);
    }
}

function hideBeeTooltip() {
    clearTimeout(beeTooltipTimeout);
    const footerCenter = document.querySelector('.landing-footer .footer-center');
    if (footerCenter) {
        footerCenter.classList.remove('bee-hovered');
    }
}

// Track all active flowers for proximity auto-collect
const activeFlowers = new Set();

const landing = document.getElementById('landing');

// Animate hint-feed pulse periodically to draw attention
let hintPulseInterval = null;
function startHintPulse() {
    if (hintPulseInterval) return;
    const hintFeed = document.querySelector('.landing-footer .hint-feed');
    if (!hintFeed) return;
    // Initial nudge after 3s
    setTimeout(() => {
        hintFeed.classList.add('hint-nudge');
        setTimeout(() => hintFeed.classList.remove('hint-nudge'), 700);
    }, 3000);
    // Then repeat every 12s
    hintPulseInterval = setInterval(() => {
        if (phase !== 'landing') return;
        hintFeed.classList.add('hint-nudge');
        setTimeout(() => hintFeed.classList.remove('hint-nudge'), 700);
    }, 12000);
}

if (landing) {
    startHintPulse();

    landing.addEventListener('dblclick', (e) => {
        if (phase !== 'landing') return;

        const rect = landing.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        spawnFlower(clickX, clickY, landing);
    });
}

function spawnFlower(clickX, clickY, container) {
    const flowers = ['ASSETS/flower1.svg', 'ASSETS/flower2.svg', 'ASSETS/flower3.svg'];
    const randomFlower = flowers[Math.floor(Math.random() * flowers.length)];

    const flower = document.createElement('div');
    flower.className = 'spawned-flower';
    flower.style.left = `${clickX}px`;
    flower.style.top = `${clickY}px`;
    flower.style.backgroundImage = `url('${randomFlower}')`;

    container.appendChild(flower);
    activeFlowers.add(flower);

    requestAnimationFrame(() => {
        flower.classList.add('active');
    });

    // Auto-remove after 8 seconds if not collected
    const autoRemove = setTimeout(() => {
        if (flower.parentNode) {
            flower.classList.add('fading-out');
            setTimeout(() => { flower.remove(); activeFlowers.delete(flower); }, 500);
        }
    }, 8000);
    flower._autoRemove = autoRemove;

    flower.addEventListener('click', (ev) => {
        ev.stopPropagation();
        clearTimeout(flower._autoRemove);
        collectFlower(flower);
    });

    return flower;
}

// Auto-collect flowers that drift near the bee
function checkFlowerProximity(beePixelX, beePixelY) {
    if (!landing || activeFlowers.size === 0) return;
    const rect = landing.getBoundingClientRect();
    const AUTO_COLLECT_RADIUS = 90;

    activeFlowers.forEach(flower => {
        if (!flower.parentNode) { activeFlowers.delete(flower); return; }
        const fx = parseFloat(flower.style.left) + rect.left;
        const fy = parseFloat(flower.style.top) + rect.top;
        const dist = Math.hypot(fx - beePixelX, fy - beePixelY);
        if (dist < AUTO_COLLECT_RADIUS) {
            clearTimeout(flower._autoRemove);
            collectFlower(flower);
        }
    });
}

function collectFlower(flower) {
    if (!activeFlowers.has(flower)) return; // already collected
    activeFlowers.delete(flower);

    const rect = landing ? landing.getBoundingClientRect() : { left: 0, top: 0 };
    // Find where the bee is on screen
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;

    if (beeModel && camera && canvasContainer) {
        const screenPos = beeModel.position.clone().project(camera);
        const cr = canvasContainer.getBoundingClientRect();
        targetX = cr.left + (screenPos.x * 0.5 + 0.5) * cr.width;
        targetY = cr.top + (-screenPos.y * 0.5 + 0.5) * cr.height;
    }

    // Particle burst at flower position
    const flowerAbsX = parseFloat(flower.style.left) + rect.left;
    const flowerAbsY = parseFloat(flower.style.top) + rect.top;
    spawnParticleBurst(flowerAbsX, flowerAbsY);

    // Animate flower flying to bee
    flower.style.transition = 'left 0.55s cubic-bezier(0.25, 1, 0.5, 1), top 0.55s cubic-bezier(0.25, 1, 0.5, 1), transform 0.55s ease, opacity 0.55s ease';
    flower.style.left = `${targetX - rect.left}px`;
    flower.style.top = `${targetY - rect.top}px`;
    flower.style.transform = 'translate(-50%, -50%) scale(0) rotate(270deg)';
    flower.style.opacity = '0';

    hasFedBee = true;
    flowerCount++;
    sessionStorage.setItem('bee_flowers', flowerCount);
    updateBeeScore();

    const milestoneMsg = getMilestoneMsg(flowerCount);
    showBeeTooltip(milestoneMsg || undefined);

    setTimeout(() => { flower.remove(); }, 600);

    spawnPlusOne(targetX, targetY);
}

function spawnParticleBurst(x, y) {
    const PARTICLE_COUNT = 8;
    const colors = ['#f9c74f', '#f3722c', '#90be6d', '#43aa8b', '#577590', '#f94144'];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = document.createElement('div');
        p.className = 'bee-particle';
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
        const dist = 40 + Math.random() * 30;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist;
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        p.style.setProperty('--tx', `${tx}px`);
        p.style.setProperty('--ty', `${ty}px`);
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDelay = `${Math.random() * 0.08}s`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 700);
    }
}

function spawnPlusOne(x, y) {
    const plusOne = document.createElement('div');
    plusOne.className = 'plus-one-float';
    plusOne.innerHTML = `+<img src="ASSETS/flower1.svg" class="plus-one-icon" aria-hidden="true">`;
    plusOne.style.left = `${x}px`;
    plusOne.style.top = `${y}px`;

    document.body.appendChild(plusOne);

    requestAnimationFrame(() => {
        plusOne.classList.add('animate');
    });

    setTimeout(() => {
        plusOne.remove();
    }, 1000);
}

// Initialise score display
updateBeeScore();

loadProjects();

(function initPageFade() {
    const isIndex = !isAboutPage;
    if (isIndex && !hasVisited) {
        return;
    }

    const pageOverlay = document.createElement('div');
    pageOverlay.style.position = 'fixed';
    pageOverlay.style.inset = '0';
    pageOverlay.style.backgroundColor = '#ffffff';
    pageOverlay.style.zIndex = '99999';
    pageOverlay.style.opacity = '1';
    pageOverlay.style.transition = 'opacity 0.4s ease-out';
    pageOverlay.style.pointerEvents = 'none';
    document.body.appendChild(pageOverlay);

    if (isIndex && hasVisited) {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.remove();
        showElementsInstantly();
    }

    // Rewrite URLs on client side for clean URL display without breaking server routes
    try {
        const path = window.location.pathname;
        if (path.endsWith('index.html')) {
            window.history.replaceState({}, '', path.replace('index.html', ''));
        } else if (path.endsWith('about.html')) {
            window.history.replaceState({}, '', path.replace('about.html', 'about'));
        }
    } catch (e) {
        console.warn("History API not supported / restricted:", e);
    }

    // Scroll to projects immediately if coming from Projects link in About page
    if (isIndex) {
        const shouldScroll = sessionStorage.getItem('scrollToProjects');
        if (shouldScroll === 'true') {
            sessionStorage.removeItem('scrollToProjects');
            // Go to projects instantly
            setTimeout(() => {
                goToProjects();
            }, 100);
        }
    }

    requestAnimationFrame(() => {
        pageOverlay.style.opacity = '0';
        setTimeout(() => {
            pageOverlay.remove();
        }, 400);
    });
})();

document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) {
        let href = link.getAttribute('href') || '';
        if (href === 'about' || href === 'about.html' || href === '/' || href.startsWith('/#') || href === 'index.html' || href.startsWith('index.html#')) {
            e.preventDefault();

            // If clicking Projects from About, save scroll state and go to clean '/'
            if (link.id === 'link-projects-from-about' || href.includes('#projects')) {
                sessionStorage.setItem('scrollToProjects', 'true');
                href = '/';
            }

            const targetUrl = href;

            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.backgroundColor = '#ffffff';
            overlay.style.zIndex = '99999';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.35s ease-in-out';
            overlay.style.pointerEvents = 'none';
            document.body.appendChild(overlay);

            void overlay.offsetHeight;
            overlay.style.opacity = '1';

            setTimeout(() => {
                window.location.href = targetUrl;
            }, 350);
        }
    }
});

// Protect images and content from direct copying and inspect element
(function protectSite() {
    let devMode = false;
    let inputSequence = "";

    // Listen for the secret word "dev" typed sequentially
    document.addEventListener('keydown', (e) => {
        // Keep track of the last 3 characters typed
        if (e.key && e.key.length === 1) {
            inputSequence += e.key.toLowerCase();
            if (inputSequence.length > 3) {
                inputSequence = inputSequence.slice(-3);
            }
            if (inputSequence === "dev") {
                devMode = !devMode;
                showDevModeFeedback(devMode);
                inputSequence = ""; // reset
            }
        }
    }, true);

    function showDevModeFeedback(enabled) {
        let alertBox = document.getElementById('dev-mode-alert');
        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'dev-mode-alert';
            alertBox.style.position = 'fixed';
            alertBox.style.bottom = '20px';
            alertBox.style.left = '50%';
            alertBox.style.transform = 'translateX(-50%)';
            alertBox.style.backgroundColor = 'rgba(0,0,0,0.85)';
            alertBox.style.color = '#fff';
            alertBox.style.padding = '8px 16px';
            alertBox.style.borderRadius = '4px';
            alertBox.style.fontFamily = 'sans-serif';
            alertBox.style.fontSize = '10pt';
            alertBox.style.zIndex = '999999';
            alertBox.style.transition = 'opacity 0.3s ease';
            alertBox.style.pointerEvents = 'none';
            document.body.appendChild(alertBox);
        }
        alertBox.textContent = enabled ? "🔧 Developer mode: ENABLED (Inspect unlocked)" : "🔒 Developer mode: DISABLED (Inspect locked)";
        alertBox.style.opacity = '1';
        setTimeout(() => {
            alertBox.style.opacity = '0';
        }, 2500);
    }

    // 1. Disable Right Click Context Menu (if not in devMode)
    document.addEventListener('contextmenu', (e) => {
        if (!devMode) {
            e.preventDefault();
        }
    }, false);

    // 2. Prevent drag-and-drop of images and videos (if not in devMode)
    document.addEventListener('dragstart', (e) => {
        if (!devMode && (e.target.nodeName === 'IMG' || e.target.nodeName === 'VIDEO')) {
            e.preventDefault();
        }
    }, false);

    // 3. Block Developer Tools keyboard shortcuts (if not in devMode)
    document.addEventListener('keydown', (e) => {
        if (devMode) return;

        // F12 key
        if (e.key === 'F12') {
            e.preventDefault();
            return false;
        }

        // Cmd + Option + I / C / J (macOS) or Ctrl + Shift + I / C / J (Windows/Linux)
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') > -1;
        const isInspectCombination = isMac 
            ? (e.metaKey && e.altKey && (e.key === 'i' || e.key === 'I' || e.key === 'c' || e.key === 'C' || e.key === 'j' || e.key === 'J'))
            : (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.key === 'c' || e.key === 'C' || e.key === 'j' || e.key === 'J'));

        // Ctrl + U (View Source)
        const isViewSource = isMac
            ? (e.metaKey && e.altKey && (e.key === 'u' || e.key === 'U'))
            : (e.ctrlKey && (e.key === 'u' || e.key === 'U'));

        if (isInspectCombination || isViewSource) {
            e.preventDefault();
            return false;
        }
    }, false);
})();