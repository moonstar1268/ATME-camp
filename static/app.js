document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initProgramCodeInputs();
  initTeacherPickers();
  initTemplateLockModal();
  initProgramDeleteForms();
  initCopyButtons();
  initDataTables();
  initKeywordEditors();
  initModalDialogs();
  initStudentReviewModal();
  initAdminSchoolSelector();
  initStudentCurriculumSelectors();
});

function initTabs() {
  document.querySelectorAll("[data-tabs]").forEach((tabsRoot) => {
    const buttons = Array.from(tabsRoot.querySelectorAll("[data-tab-target]"));
    const panels = Array.from(tabsRoot.querySelectorAll("[data-tab-panel]"));
    if (!buttons.length || !panels.length) {
      return;
    }

    const initialTarget =
      buttons.find((button) => button.classList.contains("is-active"))?.dataset.tabTarget ||
      panels.find((panel) => panel.classList.contains("is-active"))?.dataset.tabPanel ||
      buttons[0].dataset.tabTarget;

    const activate = (name) => {
      buttons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.tabTarget === name);
      });
      panels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.tabPanel === name);
      });
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => activate(button.dataset.tabTarget));
    });

    activate(initialTarget);
  });
}

function initProgramCodeInputs() {
  document.querySelectorAll("input[name='program_code'], input[name='access_code']").forEach((input) => {
    input.addEventListener("input", (event) => {
      event.currentTarget.value = event.currentTarget.value
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
        .slice(0, 12);
    });
  });
}

function initTeacherPickers() {
  document.querySelectorAll("[data-teacher-picker]").forEach((picker) => {
    const input = picker.querySelector("[data-teacher-lookup]");
    const hiddenInput = picker.querySelector("[data-teacher-ids]");
    const addButton = picker.querySelector("[data-add-teacher]");
    const selectedList = picker.querySelector("[data-selected-teachers]");
    const dataListId = input?.getAttribute("list");
    const dataList = dataListId ? document.getElementById(dataListId) : null;
    if (!input || !hiddenInput || !addButton || !selectedList || !dataList) {
      return;
    }

    const selectedTeachers = new Map();
    const options = Array.from(dataList.querySelectorAll("option"));

    const findOptionById = (teacherId) =>
      options.find((option) => String(option.dataset.id || "") === String(teacherId));

    const syncHiddenInput = () => {
      hiddenInput.value = Array.from(selectedTeachers.keys()).join(",");
    };

    const renderSelectedTeachers = () => {
      selectedList.innerHTML = "";

      if (!selectedTeachers.size) {
        const empty = document.createElement("p");
        empty.className = "teacher-picker-empty";
        empty.textContent = "아직 배정된 강사가 없습니다.";
        selectedList.appendChild(empty);
        syncHiddenInput();
        return;
      }

      selectedTeachers.forEach((teacher, teacherId) => {
        const chip = document.createElement("div");
        chip.className = "teacher-chip";

        const textWrap = document.createElement("div");
        textWrap.className = "teacher-chip-text";
        textWrap.innerHTML = `
          <strong>${escapeHtml(teacher.name)}</strong>
          <span>${escapeHtml(teacher.username)}</span>
          <code>${escapeHtml(teacher.code)}</code>
        `;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "teacher-chip-remove";
        removeButton.setAttribute("aria-label", "강사 제거");
        removeButton.textContent = "×";
        removeButton.addEventListener("click", () => {
          selectedTeachers.delete(teacherId);
          renderSelectedTeachers();
        });

        chip.appendChild(textWrap);
        chip.appendChild(removeButton);
        selectedList.appendChild(chip);
      });

      syncHiddenInput();
    };

    const addTeacherFromOption = (matchedOption) => {
      if (!matchedOption?.dataset.id) {
        window.alert("목록에 있는 강사를 선택한 뒤 추가해 주세요.");
        return;
      }
      if (!selectedTeachers.has(matchedOption.dataset.id)) {
        selectedTeachers.set(matchedOption.dataset.id, {
          name: matchedOption.dataset.name || matchedOption.value,
          username: matchedOption.dataset.username || "-",
          code: matchedOption.dataset.code || "-",
        });
      }
      input.value = "";
      renderSelectedTeachers();
    };

    const addTeacher = () => {
      const matchedOption = options.find((option) => option.value === input.value);
      addTeacherFromOption(matchedOption);
    };

    hiddenInput.value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((teacherId) => {
        const option = findOptionById(teacherId);
        if (option) {
          selectedTeachers.set(teacherId, {
            name: option.dataset.name || option.value,
            username: option.dataset.username || "-",
            code: option.dataset.code || "-",
          });
        }
      });

    addButton.addEventListener("click", addTeacher);

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addTeacher();
      }
    });

    input.form?.addEventListener("submit", (event) => {
      if (!selectedTeachers.size) {
        event.preventDefault();
        window.alert("프로그램에 배정할 강사를 한 명 이상 추가해 주세요.");
      } else {
        syncHiddenInput();
      }
    });

    renderSelectedTeachers();
  });
}

function initTemplateLockModal() {
  const modal = document.querySelector("[data-template-lock-modal]");
  if (!modal) {
    return;
  }

  const nameTarget = modal.querySelector("[data-template-lock-name]");

  const close = () => {
    modal.hidden = true;
  };

  document.querySelectorAll("[data-template-lock-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      if (nameTarget) {
        nameTarget.textContent = button.dataset.templateName || "선택한 유형";
      }
      modal.hidden = false;
    });
  });

  modal.querySelectorAll("[data-template-lock-close]").forEach((button) => {
    button.addEventListener("click", close);
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      close();
    }
  });
}

function initProgramDeleteForms() {
  document.querySelectorAll("[data-program-delete-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const confirmed = window.confirm("이 프로그램을 삭제하시겠습니까?");
      if (!confirmed) {
        return;
      }

      const submitButton = form.querySelector("button[type='submit']");
      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const response = await fetch(form.action, {
          method: "POST",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        if (!response.ok) {
          throw new Error("Delete failed");
        }

        window.location.reload();
      } catch (error) {
        if (submitButton) {
          submitButton.disabled = false;
        }
        window.alert("프로그램 삭제 중 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.");
      }
    });
  });
}

function initCopyButtons() {
  document.querySelectorAll("[data-copy-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = document.getElementById(button.dataset.copySource);
      const target = document.getElementById(button.dataset.copyTarget);
      if (!source || !target) {
        return;
      }
      target.value = source.textContent.trim();
      target.focus();
    });
  });
}

function initDataTables() {
  document.querySelectorAll("[data-table-root]").forEach((root) => {
    const tbody = root.querySelector("[data-table-body]") || root.querySelector("tbody");
    if (!tbody) {
      return;
    }

    const rows = Array.from(tbody.querySelectorAll("tr")).filter((row) => !row.hasAttribute("data-empty-row"));
    const searchInput = root.querySelector("[data-table-search]");
    const statusTarget = root.querySelector("[data-table-status]");
    const pageTarget = root.querySelector("[data-table-page]");
    const prevButton = root.querySelector("[data-table-prev]");
    const nextButton = root.querySelector("[data-table-next]");
    const pageSize = Number(root.dataset.pageSize || 10);
    const columnCount =
      tbody.closest("table")?.querySelectorAll("thead th").length ||
      tbody.querySelector("tr td")?.closest("tr")?.children.length ||
      1;

    let emptyRow = tbody.querySelector("[data-empty-row]");
    if (!emptyRow) {
      emptyRow = document.createElement("tr");
      emptyRow.setAttribute("data-empty-row", "");
      const cell = document.createElement("td");
      cell.colSpan = columnCount;
      cell.textContent = "표시할 데이터가 없습니다.";
      emptyRow.appendChild(cell);
      emptyRow.style.display = "none";
      tbody.appendChild(emptyRow);
    }

    let currentPage = 1;

    const getFilteredRows = () => {
      const query = (searchInput?.value || "").trim().toLowerCase();
      if (!query) {
        return rows;
      }
      return rows.filter((row) => row.textContent.toLowerCase().includes(query));
    };

    const render = () => {
      const filteredRows = getFilteredRows();
      const totalCount = rows.length;
      const filteredCount = filteredRows.length;
      const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
      currentPage = Math.min(currentPage, totalPages);

      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize;

      rows.forEach((row, index) => {
        const isVisible = filteredRows.includes(row) && index >= 0;
        row.classList.add("data-table-hidden");
        row.style.display = "none";
        if (!filteredRows.includes(row)) {
          return;
        }
        const visibleIndex = filteredRows.indexOf(row);
        const shouldShow = visibleIndex >= start && visibleIndex < end;
        row.classList.toggle("data-table-hidden", !shouldShow);
        row.style.display = shouldShow ? "" : "none";
      });

      const hasVisibleRows = filteredCount > 0;
      emptyRow.style.display = hasVisibleRows ? "none" : "";

      if (statusTarget) {
        statusTarget.textContent = `총 ${totalCount}건 · 검색 결과 ${filteredCount}건`;
      }

      if (pageTarget) {
        if (!hasVisibleRows) {
          pageTarget.textContent = "표시할 데이터가 없습니다.";
        } else {
          pageTarget.textContent = `${currentPage} / ${totalPages} 페이지`;
        }
      }

      if (prevButton) {
        prevButton.disabled = currentPage <= 1 || !hasVisibleRows;
      }
      if (nextButton) {
        nextButton.disabled = currentPage >= totalPages || !hasVisibleRows;
      }
    };

    searchInput?.addEventListener("input", () => {
      currentPage = 1;
      render();
    });

    prevButton?.addEventListener("click", () => {
      currentPage = Math.max(1, currentPage - 1);
      render();
    });

    nextButton?.addEventListener("click", () => {
      currentPage += 1;
      render();
    });

    render();
  });
}

function initKeywordEditors() {
  document.querySelectorAll("[data-keyword-editor]").forEach((editor) => {
    const hiddenInput = editor.querySelector("[data-keyword-value]");
    const textInput = editor.querySelector("[data-keyword-input]");
    const addButton = editor.querySelector("[data-keyword-add]");
    const list = editor.querySelector("[data-keyword-list]");
    const clearButton = editor.querySelector("[data-keyword-clear]");

    if (!hiddenInput || !textInput || !addButton || !list || !clearButton) {
      return;
    }

    const keywords = normalizeKeywords(hiddenInput.value);

    const sync = () => {
      hiddenInput.value = keywords.join(", ");
    };

    const render = () => {
      list.innerHTML = "";

      if (!keywords.length) {
        const empty = document.createElement("p");
        empty.className = "teacher-picker-empty";
        empty.textContent = "아직 추가된 키워드가 없습니다.";
        list.appendChild(empty);
        sync();
        return;
      }

      keywords.forEach((keyword, index) => {
        const chip = document.createElement("span");
        chip.className = "keyword-chip";
        chip.innerHTML = `
          <span>${escapeHtml(keyword)}</span>
          <button type="button" aria-label="키워드 삭제">×</button>
        `;
        chip.querySelector("button").addEventListener("click", () => {
          keywords.splice(index, 1);
          render();
        });
        list.appendChild(chip);
      });

      sync();
    };

    const addKeyword = () => {
      const value = textInput.value.trim();
      if (!value) {
        return;
      }
      if (!keywords.includes(value)) {
        keywords.push(value);
      }
      textInput.value = "";
      render();
      textInput.focus();
    };

    addButton.addEventListener("click", addKeyword);
    textInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addKeyword();
      }
    });

    clearButton.addEventListener("click", () => {
      keywords.splice(0, keywords.length);
      render();
    });

    render();
  });
}

function initModalDialogs() {
  document.querySelectorAll("dialog[data-modal]").forEach((dialog) => {
    dialog.querySelectorAll("[data-modal-close]").forEach((button) => {
      button.addEventListener("click", () => closeDialog(dialog));
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeDialog(dialog);
      }
    });
  });
}

function initStudentReviewModal() {
  const openButton = document.querySelector("[data-student-review-open]");
  const modal = document.getElementById("student-review-modal");
  const confirmButton = document.querySelector("[data-student-review-confirm]");
  const submitButton = document.querySelector("[data-student-submit-confirm]");
  const desiredMajorInput = document.querySelector("input[name='desired_major']");
  const reviewMajorTarget = document.querySelector("[data-review-major]");

  if (!openButton || !modal || !confirmButton || !submitButton) {
    return;
  }

  openButton.addEventListener("click", () => {
    if (reviewMajorTarget) {
      reviewMajorTarget.textContent = desiredMajorInput?.value?.trim() || "-";
    }
    openDialog(modal);
  });

  confirmButton.addEventListener("click", () => {
    closeDialog(modal);
    submitButton.click();
  });
}

const referenceCache = {
  cities: null,
  curricula: null,
  districts: new Map(),
  schools: new Map(),
  curriculumUnits: new Map(),
  curriculumSubUnits: new Map(),
};

async function readReferenceData(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${url}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function loadCities() {
  if (!referenceCache.cities) {
    referenceCache.cities = await readReferenceData("/references/cities");
  }
  return referenceCache.cities;
}

async function loadDistricts(cityId) {
  if (!referenceCache.districts.has(cityId)) {
    referenceCache.districts.set(cityId, await readReferenceData(`/references/${cityId}/districts`));
  }
  return referenceCache.districts.get(cityId) || [];
}

async function loadSchools(districtId, schoolLevel) {
  const cacheKey = `${districtId}:${schoolLevel}`;
  if (!referenceCache.schools.has(cacheKey)) {
    referenceCache.schools.set(
      cacheKey,
      await readReferenceData(`/references/${districtId}/schools?schoolLevel=${schoolLevel}`),
    );
  }
  return referenceCache.schools.get(cacheKey) || [];
}

async function loadCurricula() {
  if (!referenceCache.curricula) {
    referenceCache.curricula = await readReferenceData("/references/curricula");
  }
  return referenceCache.curricula;
}

async function loadCurriculumUnits(curriculumId) {
  if (!referenceCache.curriculumUnits.has(curriculumId)) {
    referenceCache.curriculumUnits.set(
      curriculumId,
      await readReferenceData(`/references/curricula/${curriculumId}`),
    );
  }
  return referenceCache.curriculumUnits.get(curriculumId) || [];
}

async function loadCurriculumSubUnits(curriculumUnitId) {
  if (!referenceCache.curriculumSubUnits.has(curriculumUnitId)) {
    referenceCache.curriculumSubUnits.set(
      curriculumUnitId,
      await readReferenceData(`/references/curriculumUnit/${curriculumUnitId}`),
    );
  }
  return referenceCache.curriculumSubUnits.get(curriculumUnitId) || [];
}

function setSelectOptions(select, items, placeholder, config = {}) {
  const { valueKey = "id", labelKey = "name", selectedValue = "" } = config;
  select.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = String(item[valueKey] ?? "");
    option.textContent = item[labelKey] ?? "";
    if (String(selectedValue) && option.value === String(selectedValue)) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function createReferenceField(title, select) {
  const wrapper = document.createElement("div");
  wrapper.className = "reference-select-field";

  const label = document.createElement("small");
  label.className = "reference-select-label";
  label.textContent = title;

  wrapper.appendChild(label);
  wrapper.appendChild(select);
  return wrapper;
}

function createSelect(className = "") {
  const select = document.createElement("select");
  if (className) {
    select.className = className;
  }
  return select;
}

function initAdminSchoolSelector() {
  const form = document.querySelector("form[action='/admin/programs']");
  if (!form) {
    return;
  }

  const schoolLevelInput = form.querySelector("select[name='school_level']");
  const schoolNameInput = form.querySelector("input[name='school_name']");
  const schoolLevelLabel = schoolLevelInput?.closest("label");
  const schoolNameLabel = schoolNameInput?.closest("label");

  if (!schoolLevelInput || !schoolNameInput || !schoolNameLabel) {
    return;
  }
  if (schoolNameLabel.querySelector("[data-school-selector-ui]")) {
    return;
  }

  if (schoolLevelLabel) {
    schoolLevelLabel.hidden = true;
  }

  schoolNameInput.type = "hidden";
  schoolNameInput.readOnly = true;

  const title = schoolNameLabel.querySelector("span");
  if (title) {
    title.textContent = "학교 선택";
  }

  const selector = document.createElement("div");
  selector.className = "reference-enhancer compact-top";
  selector.dataset.schoolSelectorUi = "true";

  const levelRow = document.createElement("div");
  levelRow.className = "reference-choice-row";

  const searchRow = document.createElement("div");
  searchRow.className = "reference-search-row";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "학교명 검색";
  searchInput.autocomplete = "off";
  searchRow.appendChild(searchInput);

  const grid = document.createElement("div");
  grid.className = "reference-select-grid reference-select-grid-school";

  const citySelect = createSelect();
  const districtSelect = createSelect();
  const schoolSelect = createSelect();
  districtSelect.disabled = true;
  schoolSelect.disabled = true;

  grid.appendChild(createReferenceField("지역1", citySelect));
  grid.appendChild(createReferenceField("지역2", districtSelect));
  grid.appendChild(createReferenceField("학교", schoolSelect));

  const summary = document.createElement("p");
  summary.className = "reference-summary-text";

  const help = document.createElement("p");
  help.className = "reference-inline-help";
  help.textContent = "ATME 운영과 같은 흐름으로 교급, 지역, 학교를 순서대로 선택하면 프로그램 학교명이 자동 입력됩니다.";

  selector.appendChild(levelRow);
  selector.appendChild(searchRow);
  selector.appendChild(grid);
  selector.appendChild(summary);
  selector.appendChild(help);
  schoolNameLabel.appendChild(selector);

  const choices = [
    { label: "중학교", value: "중학교", apiValue: "MIDDLE" },
    { label: "고등학교", value: "고등학교", apiValue: "HIGH" },
  ];

  let currentLevel =
    choices.find((choice) => choice.value === schoolLevelInput.value)?.value || "고등학교";
  let schoolOptions = [];
  let selectedCityName = "";
  let selectedDistrictName = "";

  const syncLevelButtons = () => {
    Array.from(levelRow.querySelectorAll("button")).forEach((button) => {
      button.classList.toggle("is-active", button.dataset.value === currentLevel);
    });
    schoolLevelInput.value = currentLevel;
  };

  const updateSummary = () => {
    if (schoolNameInput.value) {
      const segments = [selectedCityName, selectedDistrictName, schoolNameInput.value].filter(Boolean);
      summary.textContent = `선택한 학교: ${segments.join(" > ")}`;
      return;
    }
    summary.textContent = "선택한 학교가 아직 없습니다.";
  };

  const renderSchoolOptions = () => {
    const keyword = searchInput.value.trim().toLowerCase();
    const filteredOptions = schoolOptions.filter((item) =>
      String(item.name || "").toLowerCase().includes(keyword),
    );

    setSelectOptions(
      schoolSelect,
      filteredOptions,
      filteredOptions.length ? "학교 선택" : "학교 없음",
      { valueKey: "schoolId", labelKey: "name" },
    );

    schoolSelect.disabled = filteredOptions.length === 0;
  };

  const resetSchoolSelection = () => {
    schoolOptions = [];
    schoolNameInput.value = "";
    setSelectOptions(schoolSelect, [], "학교 선택");
    schoolSelect.disabled = true;
    updateSummary();
  };

  const loadSchoolOptionsForDistrict = async () => {
    const districtId = districtSelect.value;
    resetSchoolSelection();
    if (!districtId) {
      return;
    }
    const choice = choices.find((item) => item.value === currentLevel) || choices[1];
    schoolOptions = await loadSchools(districtId, choice.apiValue);
    renderSchoolOptions();
  };

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reference-toggle-button";
    button.dataset.value = choice.value;
    button.textContent = choice.label;
    button.addEventListener("click", async () => {
      currentLevel = choice.value;
      syncLevelButtons();
      await loadSchoolOptionsForDistrict();
    });
    levelRow.appendChild(button);
  });

  citySelect.addEventListener("change", async () => {
    const cityId = citySelect.value;
    selectedCityName = citySelect.options[citySelect.selectedIndex]?.textContent || "";
    selectedDistrictName = "";
    setSelectOptions(districtSelect, [], cityId ? "불러오는 중..." : "지역2");
    districtSelect.disabled = !cityId;
    resetSchoolSelection();

    if (!cityId) {
      updateSummary();
      return;
    }

    try {
      const districts = await loadDistricts(cityId);
      setSelectOptions(districtSelect, districts, "지역2", {
        valueKey: "districtId",
        labelKey: "name",
      });
    } catch {
      districtSelect.disabled = true;
      summary.textContent = "지역 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
    updateSummary();
  });

  districtSelect.addEventListener("change", async () => {
    selectedDistrictName = districtSelect.options[districtSelect.selectedIndex]?.textContent || "";
    try {
      await loadSchoolOptionsForDistrict();
    } catch {
      summary.textContent = "학교 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
    updateSummary();
  });

  schoolSelect.addEventListener("change", () => {
    schoolNameInput.value = schoolSelect.options[schoolSelect.selectedIndex]?.textContent || "";
    updateSummary();
  });

  searchInput.addEventListener("input", () => {
    renderSchoolOptions();
    if (schoolNameInput.value) {
      const stillExists = Array.from(schoolSelect.options).some(
        (option) => option.textContent === schoolNameInput.value,
      );
      if (!stillExists) {
        schoolNameInput.value = "";
      }
    }
    updateSummary();
  });

  setSelectOptions(citySelect, [], "지역1");
  updateSummary();
  syncLevelButtons();

  loadCities()
    .then((cities) => {
      setSelectOptions(citySelect, cities, "지역1", {
        valueKey: "cityId",
        labelKey: "name",
      });
    })
    .catch(() => {
      summary.textContent = "학교 선택 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    });
}

function initStudentCurriculumSelectors() {
  const form = document.querySelector("form[action='/student/submit']");
  if (!form) {
    return;
  }

  form.querySelectorAll("input[name^='linked_subject_']").forEach((subjectInput) => {
    const suffix = subjectInput.name.replace("linked_subject_", "");
    const unitInput =
      form.querySelector(`input[name='linked_unit_${suffix}']`) ||
      form.querySelector(`textarea[name='linked_unit_${suffix}']`);
    const subjectCard = subjectInput.closest("label");
    const unitCard = unitInput?.closest("label");

    if (!unitInput || !subjectCard || !unitCard) {
      return;
    }
    if (subjectCard.querySelector("[data-curriculum-selector-ui]")) {
      return;
    }

    subjectCard.classList.add("curriculum-selector-card");
    unitCard.hidden = true;

    if (subjectInput.tagName === "INPUT") {
      subjectInput.type = "hidden";
    } else {
      subjectInput.hidden = true;
    }

    if (unitInput.tagName === "INPUT") {
      unitInput.type = "hidden";
    } else {
      unitInput.hidden = true;
    }

    const caption = subjectCard.querySelector("span");
    if (caption) {
      caption.textContent = `교과/단원 선택 ${suffix}`;
    }

    const selector = document.createElement("div");
    selector.className = "reference-enhancer compact-top";
    selector.dataset.curriculumSelectorUi = "true";

    const grid = document.createElement("div");
    grid.className = "reference-select-grid reference-select-grid-curriculum";

    const subjectSelect = createSelect();
    const unitGroupSelect = createSelect();
    const subUnitSelect = createSelect();
    unitGroupSelect.disabled = true;
    subUnitSelect.disabled = true;

    grid.appendChild(createReferenceField("교과", subjectSelect));
    grid.appendChild(createReferenceField("대단원", unitGroupSelect));
    grid.appendChild(createReferenceField("세부 단원", subUnitSelect));

    const summary = document.createElement("p");
    summary.className = "reference-summary-text";

    const help = document.createElement("p");
    help.className = "reference-inline-help";
    help.textContent = "이번 학기에 수강하는 과목으로 선택해주시기 바랍니다.";

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "reference-clear-button";
    clearButton.textContent = "선택 초기화";

    selector.appendChild(grid);
    selector.appendChild(summary);
    selector.appendChild(help);
    selector.appendChild(clearButton);
    subjectCard.appendChild(selector);

    const updateSummary = () => {
      if (subjectInput.value && unitInput.value) {
        summary.textContent = `선택한 교과/단원: ${subjectInput.value} > ${unitInput.value}`;
        return;
      }
      if (subjectInput.value) {
        summary.textContent = `선택한 교과: ${subjectInput.value}`;
        return;
      }
      summary.textContent = "선택한 교과/단원이 아직 없습니다.";
    };

    const resetSubUnits = () => {
      unitInput.value = "";
      subUnitSelect.disabled = true;
      setSelectOptions(subUnitSelect, [], "세부 단원");
      updateSummary();
    };

    const resetUnitGroups = () => {
      resetSubUnits();
      unitGroupSelect.disabled = true;
      setSelectOptions(unitGroupSelect, [], "대단원");
    };

    const restoreSelection = async () => {
      try {
        const curricula = await loadCurricula();
        setSelectOptions(subjectSelect, curricula, "교과", {
          valueKey: "curriculumId",
          labelKey: "curriculumName",
        });

        const subjectOption = Array.from(subjectSelect.options).find(
          (option) => option.textContent === subjectInput.value,
        );
        if (!subjectOption?.value) {
          updateSummary();
          return;
        }

        subjectSelect.value = subjectOption.value;
        const bigUnits = await loadCurriculumUnits(subjectSelect.value);
        unitGroupSelect.disabled = false;
        setSelectOptions(unitGroupSelect, bigUnits, "대단원", {
          valueKey: "curriculumUnitId",
          labelKey: "curriculumUnitName",
        });

        const chosenBigUnit = bigUnits.find((unit) =>
          String(unitInput.value || "").startsWith(String(unit.curriculumUnitName || "")),
        );

        if (chosenBigUnit?.curriculumUnitId) {
          unitGroupSelect.value = String(chosenBigUnit.curriculumUnitId);
          const subUnits = await loadCurriculumSubUnits(unitGroupSelect.value);
          subUnitSelect.disabled = false;
          setSelectOptions(subUnitSelect, subUnits, "세부 단원", {
            valueKey: "curriculumSubUnitId",
            labelKey: "curriculumSubUnitName",
          });

          const chosenSubUnit = Array.from(subUnitSelect.options).find(
            (option) => option.textContent === unitInput.value,
          );
          if (chosenSubUnit?.value) {
            subUnitSelect.value = chosenSubUnit.value;
          }
        }
      } catch {
        summary.textContent = "교과 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }

      updateSummary();
    };

    subjectSelect.addEventListener("change", async () => {
      const selectedOption = subjectSelect.options[subjectSelect.selectedIndex];
      subjectInput.value = selectedOption?.value ? selectedOption.textContent : "";
      resetUnitGroups();

      if (!subjectSelect.value) {
        updateSummary();
        return;
      }

      try {
        const bigUnits = await loadCurriculumUnits(subjectSelect.value);
        unitGroupSelect.disabled = false;
        setSelectOptions(unitGroupSelect, bigUnits, "대단원", {
          valueKey: "curriculumUnitId",
          labelKey: "curriculumUnitName",
        });
      } catch {
        summary.textContent = "대단원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }
      updateSummary();
    });

    unitGroupSelect.addEventListener("change", async () => {
      resetSubUnits();
      if (!unitGroupSelect.value) {
        updateSummary();
        return;
      }
      try {
        const subUnits = await loadCurriculumSubUnits(unitGroupSelect.value);
        subUnitSelect.disabled = false;
        setSelectOptions(subUnitSelect, subUnits, "세부 단원", {
          valueKey: "curriculumSubUnitId",
          labelKey: "curriculumSubUnitName",
        });
      } catch {
        summary.textContent = "세부 단원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }
    });

    subUnitSelect.addEventListener("change", () => {
      unitInput.value = subUnitSelect.options[subUnitSelect.selectedIndex]?.value
        ? subUnitSelect.options[subUnitSelect.selectedIndex].textContent
        : "";
      updateSummary();
    });

    clearButton.addEventListener("click", () => {
      subjectInput.value = "";
      unitInput.value = "";
      subjectSelect.value = "";
      resetUnitGroups();
      updateSummary();
    });

    setSelectOptions(subjectSelect, [], "교과");
    updateSummary();
    restoreSelection();
  });
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) {
      dialog.showModal();
    }
    return;
  }
  dialog.setAttribute("open", "open");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
}

function normalizeKeywords(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
