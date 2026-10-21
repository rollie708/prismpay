// =================================================================
// WHITEPAPER JAVASCRIPT
// TOC navigation, scroll tracking, and print functionality
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    initTOCNavigation();
    initScrollTracking();
    initPrintButton();
});

// Table of Contents Navigation
function initTOCNavigation() {
    const tocLinks = document.querySelectorAll('.toc-link');
    
    tocLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                const offset = 100;
                const targetPosition = targetSection.offsetTop - offset;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                
                // Update active state
                tocLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    });
}

// Scroll Tracking - Update active TOC link on scroll
function initScrollTracking() {
    const sections = document.querySelectorAll('.wp-section');
    const tocLinks = document.querySelectorAll('.toc-link');
    
    const observerOptions = {
        root: null,
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const sectionId = entry.target.id;
                
                // Update TOC active state
                tocLinks.forEach(link => {
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        tocLinks.forEach(l => l.classList.remove('active'));
                        link.classList.add('active');
                    }
                });
            }
        });
    }, observerOptions);
    
    sections.forEach(section => observer.observe(section));
}

// Print Button
function initPrintButton() {
    const printButton = document.querySelector('.btn-print');
    
    if (printButton) {
        printButton.addEventListener('click', () => {
            window.print();
        });
    }
}

// Smooth scroll for all anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#' && href !== '#top') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const offset = 100;
                window.scrollTo({
                    top: target.offsetTop - offset,
                    behavior: 'smooth'
                });
            }
        }
    });
});
