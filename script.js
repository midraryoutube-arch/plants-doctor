
(() => {
  "use strict";

  const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/d6C5Kzzni/";

  const MAX_SIZE = 15 * 1024 * 1024;
  const $ = id => document.getElementById(id);

  const ui = {
    input: $("imageInput"),
    drop: $("dropZone"),
    previewWrap: $("previewWrap"),
    preview: $("preview"),
    fileName: $("fileName"),
    fileDetails: $("fileDetails"),
    remove: $("removeImage"),
    analyze: $("analyzeBtn"),
    buttonText: $("buttonText"),
    plantType: $("plantType"),
    symptoms: $("symptoms"),
    empty: $("emptyReport"),
    loading: $("loadingReport"),
    loadingMessage: $("loadingMessage"),
    report: $("reportContent"),
    error: $("errorReport"),
    errorMessage: $("errorMessage"),
    retry: $("retryBtn"),
    status: $("modelStatus"),
    statusDot: $("statusDot"),
    footerStatus: $("footerStatus"),
    reportStatus: $("reportStatus"),
    diagnosisIcon: $("diagnosisIcon"),
    diagnosisLabel: $("diagnosisLabel"),
    diagnosisTitle: $("diagnosisTitle"),
    diagnosisSubtitle: $("diagnosisSubtitle"),
    confidenceValue: $("confidenceValue"),
    confidenceBar: $("confidenceBar"),
    predictionList: $("predictionList"),
    careList: $("careList"),
    toast: $("toast")
  };

  let model = null;
  let modelReady = false;
  let selectedFile = null;
  let imageUrl = null;
  let toastTimer = null;

  const advice = {
    unsure: [
      "Inspect both sides of the leaves and look closely at new growth.",
      "Take another sharp photo in natural, indirect daylight.",
      "Avoid pesticides or extra fertilizer until the cause is clearer."
    ],
    spots: [
      "Avoid wetting foliage unnecessarily and improve airflow around the plant.",
      "Remove badly affected leaves only when appropriate for the plant, using clean tools.",
      "Monitor whether new spots spread and consult a plant specialist if needed."
    ],
    yellowing: [
      "Check soil moisture before watering; both too much and too little water can yellow leaves.",
      "Check drainage and make sure roots are not sitting in water.",
      "Inspect the undersides of leaves for pests."
    ],
    wilting: [
      "Check soil moisture before adding water.",
      "Inspect drainage, roots and recent heat exposure.",
      "Protect container plants from harsh midday heat while investigating."
    ],
    mold: [
      "Improve airflow and avoid keeping foliage unnecessarily wet.",
      "Remove fallen plant debris and avoid overcrowding.",
      "Confirm the cause before choosing a fungicide."
    ],
    pests: [
      "Inspect leaf undersides and new growth to help identify the pest.",
      "Where suitable, rinse pests off and isolate affected indoor plants.",
      "Use only a treatment labelled for the identified pest and plant."
    ]
  };

  function setStatus(message, state = "loading") {
    ui.status.textContent = message;
    ui.footerStatus.textContent = message;

    const colors = {
      ready: "#a7ff78",
      error: "#ff8d9c",
      loading: "#65f4ed"
    };

    ui.statusDot.style.background = colors[state];
    ui.statusDot.style.boxShadow =
      `0 0 12px ${colors[state]}`;
  }

  function notify(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      ui.toast.classList.remove("show");
    }, 2800);
  }

  function show(view) {
    ui.empty.classList.toggle("hidden", view !== "empty");
    ui.loading.classList.toggle("hidden", view !== "loading");
    ui.report.classList.toggle("hidden", view !== "report");
    ui.error.classList.toggle("hidden", view !== "error");
  }

  function fileSize(bytes) {
    return bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function resetImage() {
    selectedFile = null;
    ui.input.value = "";

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;

    ui.preview.removeAttribute("src");
    ui.previewWrap.classList.add("hidden");
    ui.drop.classList.remove("hidden");

    ui.analyze.disabled = true;
    ui.buttonText.textContent =
      modelReady ? "Add a photo to begin" : "Loading AI model...";

    ui.reportStatus.textContent = "AWAITING PHOTO";
    show("empty");
  }

  function selectImage(file) {
    if (!file) return;

    const supported = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!supported.includes(file.type)) {
      notify("Please select a JPG, PNG or WEBP image.");
      return;
    }

    if (file.size > MAX_SIZE) {
      notify("Image exceeds 15 MB. Please choose a smaller file.");
      return;
    }

    if (imageUrl) URL.revokeObjectURL(imageUrl);

    selectedFile = file;
    imageUrl = URL.createObjectURL(file);

    ui.preview.src = imageUrl;
    ui.fileName.textContent = file.name;
    ui.fileDetails.textContent =
      `${fileSize(file.size)} · Ready for analysis`;

    ui.previewWrap.classList.remove("hidden");
    ui.drop.classList.add("hidden");

    ui.analyze.disabled = !modelReady;
    ui.buttonText.textContent =
      modelReady ? "Analyze my plant" : "Loading AI model...";

    ui.reportStatus.textContent = "PHOTO LOADED";
    show("empty");

    notify("Photo loaded successfully.");
  }

  function labelText(value) {
    return String(value || "Unknown class")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isHealthy(label) {
    return /\b(healthy|normal|good condition|no disease)\b/i.test(label);
  }

  function getCareSuggestions(label, score) {
    const labelIsHealthy = isHealthy(label);
    const suggestions = [];

    if (score < 0.45) {
      suggestions.push(
        "The model is not strongly confident. Retake a clear photo and verify the result."
      );
      suggestions.push(
        "Do not treat the top prediction as a confirmed diagnosis."
      );
    } else if (labelIsHealthy) {
      suggestions.push(
        "The top model class suggests healthy-looking foliage; continue monitoring new growth."
      );
      suggestions.push(
        "Maintain watering and light appropriate for your plant."
      );
    } else {
      suggestions.push(
        `The model predicted "${labelText(label)}". Compare this with the visible symptoms before taking action.`
      );
    }

    const symptomAdvice =
      advice[ui.symptoms.value] || advice.unsure;

    suggestions.push(...symptomAdvice);

    if (ui.plantType.value !== "unknown") {
      suggestions.push(
        "Check advice specific to your plant variety and growing conditions."
      );
    }

    return [...new Set(suggestions)].slice(0, 5);
  }

  function renderPredictions(predictions) {
    ui.predictionList.replaceChildren();

    predictions.slice(0, 6).forEach(prediction => {
      const score = Math.max(
        0,
        Math.min(1, Number(prediction.probability) || 0)
      );

      const row = document.createElement("div");
      row.className = "prediction-row";

      const name = document.createElement("span");
      name.className = "prediction-name";
      name.textContent = labelText(prediction.className);

      const percent = document.createElement("span");
      percent.className = "prediction-percent";
      percent.textContent = `${Math.round(score * 100)}%`;

      const meter = document.createElement("div");
      meter.className = "prediction-meter";

      const bar = document.createElement("span");
      bar.style.width = `${score * 100}%`;

      meter.appendChild(bar);
      row.append(name, percent, meter);
      ui.predictionList.appendChild(row);
    });
  }

  function renderReport(predictions) {
    if (!Array.isArray(predictions) || predictions.length === 0) {
      throw new Error(
        "The model returned no predictions. Check its trained classes."
      );
    }

    const sorted = [...predictions].sort(
      (a, b) => b.probability - a.probability
    );

    const best = sorted[0];
    const score = Math.max(
      0,
      Math.min(1, Number(best.probability) || 0)
    );

    const label = labelText(best.className);
    const healthy = isHealthy(label);
    const uncertain = score < 0.45;

    ui.diagnosisTitle.textContent = label;
    ui.diagnosisLabel.textContent = uncertain
      ? "LOW-CONFIDENCE PREDICTION"
      : "TOP MODEL PREDICTION";

    ui.diagnosisSubtitle.textContent = uncertain
      ? "The model score is low. Try another photo and verify the result."
      : healthy
        ? "The model's top class suggests healthy-looking foliage."
        : "This is the model's best match, not a confirmed diagnosis.";

    ui.diagnosisIcon.textContent =
      uncertain ? "?" : healthy ? "♡" : "✦";

    ui.confidenceValue.textContent =
      `${Math.round(score * 100)}%`;

    ui.confidenceBar.style.width =
      `${Math.round(score * 100)}%`;

    ui.reportStatus.textContent =
      uncertain ? "CHECK RESULT" : "ANALYSIS COMPLETE";

    renderPredictions(sorted);
    ui.careList.replaceChildren();

    getCareSuggestions(best.className, score).forEach(text => {
      const li = document.createElement("li");
      li.textContent = text;
      ui.careList.appendChild(li);
    });

    show("report");
  }

  async function loadModel() {
    modelReady = false;
    setStatus("Connecting AI...", "loading");
    ui.analyze.disabled = true;
    ui.buttonText.textContent = "Loading AI model...";

    try {
      if (!window.tmImage ||
          typeof window.tmImage.load !== "function") {
        throw new Error(
          "Teachable Machine library did not load. Check your internet connection."
        );
      }

      model = await window.tmImage.load(
        `${MODEL_URL}model.json`,
        `${MODEL_URL}metadata.json`
      );

      modelReady = true;
      setStatus("AI model ready", "ready");
      ui.analyze.disabled = !selectedFile;
      ui.buttonText.textContent = selectedFile
        ? "Analyze my plant"
        : "Add a photo to begin";

      if (!selectedFile) show("empty");

      notify("FloraPulse AI is ready.");
    } catch (error) {
      console.error("Model loading error:", error);
      model = null;
      modelReady = false;

      setStatus("AI connection issue", "error");
      ui.buttonText.textContent = "AI model unavailable";
      ui.reportStatus.textContent = "MODEL OFFLINE";
      ui.errorMessage.textContent =
        `${error.message} Check that your model URL is public and model.json and metadata.json are accessible.`;

      show("error");
    }
  }

  async function analyzeImage() {
    if (!selectedFile) {
      notify("Please upload a plant photo first.");
      return;
    }

    if (!modelReady || !model) {
      notify("The AI model is not ready yet.");
      return;
    }

    ui.analyze.disabled = true;
    ui.buttonText.textContent = "Analyzing...";
    ui.reportStatus.textContent = "ANALYZING";
    ui.loadingMessage.textContent = "Checking the image against trained classes...";
    show("loading");

    try {
      // Wait until the preview image has loaded.
      if (!ui.preview.complete || !ui.preview.naturalWidth) {
        await new Promise((resolve, reject) => {
          ui.preview.onload = resolve;
          ui.preview.onerror = () =>
            reject(new Error("Could not read the selected image."));
        });
      }

      const predictions = await model.predict(ui.preview, false);
      renderReport(predictions);
      notify("Your plant report is ready.");
    } catch (error) {
      console.error("Prediction error:", error);
      ui.reportStatus.textContent = "ANALYSIS FAILED";
      ui.errorMessage.textContent =
        `${error.message || "Analysis failed."} Try a clear photo with the leaf in focus.`;
      show("error");
    } finally {
      ui.analyze.disabled = !selectedFile || !modelReady;
      ui.buttonText.textContent = "Analyze my plant";
    }
  }

  ui.input.addEventListener("change", event => {
    selectImage(event.target.files?.[0]);
  });

  ui.drop.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      ui.input.click();
    }
  });

  ["dragenter", "dragover"].forEach(type => {
    ui.drop.addEventListener(type, event => {
      event.preventDefault();
      ui.drop.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach(type => {
    ui.drop.addEventListener(type, event => {
      event.preventDefault();
      ui.drop.classList.remove("drag-over");
    });
  });

  ui.drop.addEventListener("drop", event => {
    selectImage(event.dataTransfer?.files?.[0]);
  });

  ui.remove.addEventListener("click", resetImage);
  ui.analyze.addEventListener("click", analyzeImage);

  ui.retry.addEventListener("click", async () => {
    show("empty");
    await loadModel();
  });

  window.addEventListener("beforeunload", () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  });

  loadModel();
})();
