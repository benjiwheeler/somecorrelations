const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const disruptBtn = document.getElementById('disruptBtn');
const resetBtn = document.getElementById('resetBtn');

let data = null;
let nodes = [];
let startTime = Date.now();
let animationId = null;

// Physics parameters
const SPRING_STRENGTH = 0.015;
const DAMPING = 0.85;
const REPULSION_BASE = 80;
const NODE_RADIUS = 60;
const SMALL_NODE_RADIUS = 25; // Radius for nodes without portraits
const MAX_VELOCITY = 10;

// Simulated annealing parameters
const INITIAL_TEMPERATURE = 100;
const COOLING_RATE = 0.995;
const JITTER_FREQUENCY = 0.05; // Initial probability of jitter per frame
let temperature = INITIAL_TEMPERATURE;

// visualization parameters
const PORTRAIT_HEIGHT = 90; // Height for portrait images
const MIN_CORREL_TO_DISPLAY = 0.2; // Minimum absolute correlation to draw connection
const MIN_NUM_NODE_DIAMETERS_DISTANCE = 1.25; // Minimum number of node diameters apart that nodes can display
const MAX_DISPLAYED_NODE_DISTANCE = 300; // Maximum distance between nodes for strongest correlations


class Node {
    constructor(label, x, y, portrait) {
        this.label = label;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.ax = 0;
        this.ay = 0;
        this.hue = Math.random() * 360;
        this.portrait = portrait;
        this.image = null;

        // Load portrait image if available
        if (this.portrait) {
            this.image = new Image();
            this.image.src = this.portrait;
        }
    }

    applyForce(fx, fy) {
        this.ax += fx;
        this.ay += fy;
    }

    update() {
        // Apply acceleration to velocity
        this.vx += this.ax;
        this.vy += this.ay;

        // Apply damping
        this.vx *= DAMPING;
        this.vy *= DAMPING;

        // Limit velocity
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > MAX_VELOCITY) {
            this.vx = (this.vx / speed) * MAX_VELOCITY;
            this.vy = (this.vy / speed) * MAX_VELOCITY;
        }

        // Update position
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off walls with elasticity
        const margin = NODE_RADIUS;
        if (this.x < margin) {
            this.x = margin;
            this.vx *= -0.8;
        } else if (this.x > canvas.width - margin) {
            this.x = canvas.width - margin;
            this.vx *= -0.8;
        }
        if (this.y < margin) {
            this.y = margin;
            this.vy *= -0.8;
        } else if (this.y > canvas.height - margin) {
            this.y = canvas.height - margin;
            this.vy *= -0.8;
        }

        // Reset acceleration
        this.ax = 0;
        this.ay = 0;
    }

    draw() {
        if (this.image && this.image.complete) {
            // Calculate dimensions to maintain aspect ratio
            const aspectRatio = this.image.width / this.image.height;
            const drawHeight = PORTRAIT_HEIGHT;
            const drawWidth = drawHeight * aspectRatio;

            // Draw the image centered on the node position
            ctx.drawImage(
                this.image,
                this.x - drawWidth / 2,
                this.y - drawHeight / 2,
                drawWidth,
                drawHeight
            );

            // Draw name label below the portrait
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const labelY = this.y + drawHeight / 2 + 5;
            ctx.strokeText(this.label, this.x, labelY);
            ctx.fillText(this.label, this.x, labelY);
        } else {
            // Draw node with gradient (fallback for nodes without portraits)
            const gradient = ctx.createRadialGradient(this.x - 3, this.y - 3, 2, this.x, this.y, SMALL_NODE_RADIUS);
            gradient.addColorStop(0, `hsla(${this.hue}, 80%, 70%, 1)`);
            gradient.addColorStop(1, `hsla(${this.hue}, 70%, 50%, 1)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, SMALL_NODE_RADIUS, 0, Math.PI * 2);
            ctx.fill();

            // Draw border
            ctx.strokeStyle = `hsla(${this.hue}, 60%, 30%, 0.8)`;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw label
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.label, this.x, this.y);
        }
    }
}

function getCorrelation(nodeA, nodeB) {
    const a = nodeA.label;
    const b = nodeB.label;

    if (data.correlations[a] && data.correlations[a][b] !== undefined) {
        return data.correlations[a][b];
    }
    if (data.correlations[b] && data.correlations[b][a] !== undefined) {
        return data.correlations[b][a];
    }
    return 0;
}

function initializeNodes() {
    nodes = [];
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.3;

    data.nodes.forEach((nodeData, i) => {
        // Only create nodes with display: 1
        if (nodeData.display === 1) {
            // Random initial positions
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * radius;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            nodes.push(new Node(nodeData.label, x, y, nodeData.portrait));
        }
    });
}

function applyForces() {
    // Apply forces between all pairs of nodes
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];

            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 1) continue; // Avoid division by zero

            const correlation = getCorrelation(nodeA, nodeB);

            // Spring force based on correlation
            // Positive correlation: attract, Negative: repel
            // Use exponential scaling for ideal distance to create stronger differentiation
            let idealDistance;
            if (correlation > 0) {
                // Positive correlation: closer together
                idealDistance = MAX_DISPLAYED_NODE_DISTANCE * (1 - (correlation * correlation * .64));
            } else {
                // Negative correlation: farther apart
                idealDistance = MAX_DISPLAYED_NODE_DISTANCE * (1 + (correlation * correlation * .64));
            }

            const displacement = distance - idealDistance;
            // Stronger correlations should have stronger forces (square the correlation)
            const force = displacement * SPRING_STRENGTH * (correlation * correlation * 3 + 0.5);

            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;

            nodeA.applyForce(fx, fy);
            nodeB.applyForce(-fx, -fy);

            // Additional repulsion to prevent overlap
            if (distance < NODE_RADIUS * 2 * MIN_NUM_NODE_DIAMETERS_DISTANCE) {
                const repulsion = REPULSION_BASE / (distance * distance);
                const rfx = (dx / distance) * repulsion;
                const rfy = (dy / distance) * repulsion;
                nodeA.applyForce(-rfx, -rfy);
                nodeB.applyForce(rfx, rfy);
            }
        }

        // Gentle pull toward center to keep graph bounded
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const dx = centerX - nodes[i].x;
        const dy = centerY - nodes[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 50) {
            const centerForce = 0.001;
            nodes[i].applyForce(dx * centerForce, dy * centerForce);
        }
    }
}

function applyJitter() {
    // Simulated annealing: decrease temperature over time
    temperature *= COOLING_RATE;

    // Apply random jitter with decreasing probability and magnitude
    const jitterProb = JITTER_FREQUENCY * (temperature / INITIAL_TEMPERATURE);

    if (Math.random() < jitterProb) {
        const jitterMagnitude = temperature * 0.5;
        nodes.forEach(node => {
            node.applyForce(
                (Math.random() - 0.5) * jitterMagnitude,
                (Math.random() - 0.5) * jitterMagnitude
            );
        });
    }
}

function drawConnections() {
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];
            const correlation = getCorrelation(nodeA, nodeB);

            // Only draw significant correlations
            if (Math.abs(correlation) < MIN_CORREL_TO_DISPLAY) continue;

            // Color based on correlation
            // Blue for positive, Red for negative
            const absCorr = Math.abs(correlation);
            let color;
            if (correlation > 0) {
                // Blue for positive - stronger correlation = more saturated and darker
                const saturation = 50 + (absCorr * 50); // 50-100%
                const lightness = 70 - (absCorr * 30); // 70-40% (darker for stronger)
                color = `hsl(220, ${saturation}%, ${lightness}%)`;
            } else {
                // Red for negative - stronger correlation = more saturated and darker
                const saturation = 20 + (absCorr * 50); // 50-100%
                const lightness = 100 - (absCorr * 30); // 70-40% (darker for stronger)
                color = `hsl(0, ${saturation}%, ${lightness}%)`;
            }

            // Line width based on correlation strength - thicker for stronger correlations
            const lineWidth = 1 + (absCorr * 6); // 1-7px

            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';

            ctx.beginPath();
            ctx.moveTo(nodeA.x, nodeA.y);
            ctx.lineTo(nodeB.x, nodeB.y);
            ctx.stroke();
        }
    }
}

function animate() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply physics
    applyForces();
    applyJitter();

    // Update nodes
    nodes.forEach(node => node.update());

    // Draw
    drawConnections();
    nodes.forEach(node => node.draw());

    animationId = requestAnimationFrame(animate);
}

function disruptGraph() {
    // Apply large random forces to all nodes
    const disruptionForce = 50;
    nodes.forEach(node => {
        node.applyForce(
            (Math.random() - 0.5) * disruptionForce,
            (Math.random() - 0.5) * disruptionForce
        );
    });
    // Temporarily increase temperature
    temperature = Math.min(temperature + 30, INITIAL_TEMPERATURE);
}

function resetAnimation() {
    temperature = INITIAL_TEMPERATURE;
    initializeNodes();
}

// Event listeners
disruptBtn.addEventListener('click', disruptGraph);
resetBtn.addEventListener('click', resetAnimation);

// Mouse interaction - drag nodes
let draggedNode = null;
let mouseX = 0;
let mouseY = 0;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    // Find node under mouse
    for (let node of nodes) {
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        if (Math.sqrt(dx * dx + dy * dy) < NODE_RADIUS) {
            draggedNode = node;
            break;
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (draggedNode) {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;

        // Move node to mouse position
        draggedNode.x = mouseX;
        draggedNode.y = mouseY;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
    }
});

canvas.addEventListener('mouseup', () => {
    draggedNode = null;
});

canvas.addEventListener('mouseleave', () => {
    draggedNode = null;
});

// Load data and start animation
fetch('./correl_data.json')
    .then(response => {
        console.log('Fetch response:', response);
        return response.json();
    })
    .then(jsonData => {
        console.log('Loaded data:', jsonData);
        data = jsonData;
        initializeNodes();
        console.log('Initialized nodes:', nodes.length);
        animate();
    })
    .catch(error => {
        console.error('Error loading data:', error);
        alert('Failed to load correl_data.json. Error: ' + error.message + '\n\nIf opening directly from file://, please use a web server instead (e.g., python3 -m http.server)');
    });
