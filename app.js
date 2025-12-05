// app.js (complete, replace existing)

// Data in-memory
let data = [];
let editingIndex = null;

// DOM refs
const titleField = document.getElementById("title");
const categoryField = document.getElementById("category");
const dateField = document.getElementById("date");
const fileInput = document.getElementById("fileInput");

const btnSave = document.getElementById("btnSave");
const btnClear = document.getElementById("btnClear");
const tableBody = document.querySelector("#tableData tbody");
const toggleThemeBtn = document.getElementById("toggleTheme");

// --- Helpers ---
function createObjectUrl(file) {
    try {
        return URL.createObjectURL(file);
    } catch (e) {
        return null;
    }
}

function revokeObjectUrl(url) {
    try {
        if (url) URL.revokeObjectURL(url);
    } catch (e) {}
}

function resetForm() {
    titleField.value = "";
    categoryField.value = "";
    dateField.value = "";
    fileInput.value = "";
    editingIndex = null;
    btnSave.textContent = "Simpan";
}

// --- Render ---
function renderTable() {
    tableBody.innerHTML = "";

    if (!data.length) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#666;padding:12px">Tidak ada data</td></tr>`;
        return;
    }

    data.forEach((item, i) => {
        let fileView = "-";
        if (item.fileUrl) {
            if (item.fileType && item.fileType.startsWith("image/")) {
                fileView = `<img src="${item.fileUrl}" width="60" alt="img">`;
            } else {
                const name = item.fileName ? escapeHtml(item.fileName) : "Lihat File";
                fileView = `<a href="${item.fileUrl}" target="_blank" rel="noopener noreferrer">${name}</a>`;
            }
        }

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${i + 1}</td>
            <td>${escapeHtml(item.title)}</td>
            <td>${escapeHtml(item.category)}</td>
            <td>${escapeHtml(item.date)}</td>
            <td>${fileView}</td>
            <td>
                <button onclick="onEdit(${i})">Edit</button>
                <button onclick="onDelete(${i})">Hapus</button>
                <button onclick="onPrint(${i})">Print</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function escapeHtml(s) {
    return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
}

// --- CRUD handlers ---
btnSave.addEventListener("click", async (e) => {
    e.preventDefault();

    const title = titleField.value.trim();
    const category = categoryField.value.trim();
    const date = dateField.value;

    if (!title || !category || !date) {
        alert("Kolom wajib diisi kecuali lampiran!");
        return;
    }

    // If a file is chosen, prepare blob + url + meta
    let fileBlob = null;
    let fileUrl = null;
    let fileType = null;
    let fileName = null;

    if (fileInput.files && fileInput.files.length > 0) {
        const f = fileInput.files[0];
        fileBlob = f;
        fileType = f.type || "";
        fileName = f.name || "";
        fileUrl = createObjectUrl(f);
    }

    if (editingIndex === null) {
        // push new
        data.push({
            title,
            category,
            date,
            fileBlob,
            fileUrl,
            fileType,
            fileName
        });
    } else {
        // update existing: if new file uploaded, revoke old URL
        const existing = data[editingIndex];

        // revoke old objectURL if replaced
        if (fileBlob && existing && existing.fileUrl && existing.fileUrl !== fileUrl) {
            revokeObjectUrl(existing.fileUrl);
        }

        // If no new file uploaded, keep old fileBlob/url
        data[editingIndex] = {
            title,
            category,
            date,
            fileBlob: fileBlob || (existing ? existing.fileBlob : null),
            fileUrl: fileUrl || (existing ? existing.fileUrl : null),
            fileType: fileType || (existing ? existing.fileType : ""),
            fileName: fileName || (existing ? existing.fileName : null)
        };
    }

    resetForm();
    renderTable();
});

// Clear form
btnClear.addEventListener("click", () => {
    // If editing and we had a temp objectURL from a selected file, revoke it
    // (we only created objectURL on Save, so safe)
    resetForm();
});

// Edit
window.onEdit = function(i) {
    const item = data[i];
    if (!item) return alert("Data tidak ditemukan");

    titleField.value = item.title || "";
    categoryField.value = item.category || "";
    dateField.value = item.date || "";

    // file input cannot be set programmatically for security - leave empty
    fileInput.value = "";

    editingIndex = i;
    btnSave.textContent = "Simpan Perubahan";
};

// Delete
window.onDelete = function(i) {
    const item = data[i];
    if (!item) return;
    if (!confirm("Yakin ingin menghapus data ini?")) return;

    // revoke objectURL if any
    if (item.fileUrl) revokeObjectUrl(item.fileUrl);

    data.splice(i, 1);
    // reset editingIndex if we deleted item being edited
    if (editingIndex !== null && editingIndex === i) {
        resetForm();
    }
    renderTable();
};

// --- Print (per item) ---
window.onPrint = function(i) {
    const item = data[i];
    if (!item) return alert("Data tidak ditemukan");

    // Open print window immediately (will populate later)
    const printWindow = window.open("", "_blank");
    // Basic header while processing
    printWindow.document.write(`
        <html>
        <head>
          <title>Print Arsip</title>
          <style>body{font-family:Arial;padding:20px} img{max-width:100%;}</style>
        </head>
        <body>
          <h2>Detail Arsip</h2>
          <p><b>Judul:</b> ${escapeHtml(item.title)}</p>
          <p><b>Kategori:</b> ${escapeHtml(item.category)}</p>
          <p><b>Tanggal:</b> ${escapeHtml(item.date)}</p>
          <hr>
          <div id="content-area">Memuat lampiran...</div>
        </body>
        </html>
    `);
    printWindow.document.close();

    const contentArea = printWindow.document.getElementById("content-area");

    // If no file, simply print
    if (!item.fileBlob && !item.fileUrl) {
        contentArea.innerHTML = "<p><b>Lampiran:</b> Tidak ada lampiran</p>";
        printWindow.focus();
        printWindow.print();
        return;
    }

    // If file is DOCX (common MIME for docx)
    const isDocx = item.fileName && item.fileName.toLowerCase().endsWith(".docx")
                  || item.fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (isDocx) {
        // Use mammoth to convert DOCX to HTML (prefer fileBlob if available)
        const blobSource = item.fileBlob ? item.fileBlob : null;

        if (!blobSource) {
            contentArea.innerHTML = "<p>Tidak bisa membaca file DOCX.</p>";
            printWindow.focus();
            printWindow.print();
            return;
        }

        // convert and inject HTML
        blobSource.arrayBuffer()
            .then(arrayBuffer => mammoth.convertToHtml({ arrayBuffer }))
            .then(result => {
                // sanitize a bit: mammoth returns safe html but keep simple
                contentArea.innerHTML = `<h3>Isi Dokumen</h3>` + result.value;
                printWindow.focus();
                printWindow.print();
            })
            .catch(err => {
                console.error("mammoth error:", err);
                contentArea.innerHTML = "<p>Gagal mengonversi file DOCX.</p>";
                printWindow.focus();
                printWindow.print();
            });

        return;
    }

    // If image
    if (item.fileType && item.fileType.startsWith("image/")) {
        const imgUrl = item.fileUrl || createObjectUrl(item.fileBlob);
        contentArea.innerHTML = `<p><b>Lampiran (Gambar):</b></p><img src="${imgUrl}" alt="lampiran">`;
        printWindow.focus();
        printWindow.print();
        return;
    }

    // If PDF
    if (item.fileType === "application/pdf" || (item.fileName && item.fileName.toLowerCase().endsWith(".pdf"))) {
        const pdfUrl = item.fileUrl || createObjectUrl(item.fileBlob);
        contentArea.innerHTML = `<p><b>Lampiran (PDF):</b></p><iframe src="${pdfUrl}" width="100%" height="600px"></iframe>`;
        printWindow.focus();
        // Some browsers need time to load iframe content before print
        setTimeout(() => printWindow.print(), 700);
        return;
    }

    // Other files: provide download link and indicate cannot preview
    const otherUrl = item.fileUrl || createObjectUrl(item.fileBlob);
    const displayName = item.fileName ? escapeHtml(item.fileName) : "Unduh File";
    contentArea.innerHTML = `<p><b>Lampiran:</b> <a href="${otherUrl}" target="_blank" rel="noopener noreferrer">${displayName}</a></p>
                              <p>(Tipe file tidak dapat dipreview — klik link untuk membuka/unduh)</p>`;
    printWindow.focus();
    printWindow.print();
};

// --- Theme toggle (persist) ---
if (toggleThemeBtn) {
    toggleThemeBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        const theme = document.body.classList.contains("dark") ? "dark" : "light";
        localStorage.setItem("theme", theme);
    });

    // load saved theme
    const saved = localStorage.getItem("theme");
    if (saved === "dark") document.body.classList.add("dark");
}

// --- Initialize ---
renderTable();
