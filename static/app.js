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
        const row = document.createElement("div");
        row.className = "keyword-list-row";
        row.innerHTML = `
          <span class="keyword-list-index">${index + 1}</span>
          <div class="keyword-list-body">
            <strong>${escapeHtml(keyword)}</strong>
            <p>현재 정리된 핵심 키워드입니다.</p>
          </div>
          <button type="button" class="keyword-list-remove" aria-label="키워드 삭제">×</button>
        `;
        row.querySelector("button").addEventListener("click", () => {
          keywords.splice(index, 1);
          render();
        });
        list.appendChild(row);
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
  careers: null,
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

async function loadDesiredCareers() {
  if (!referenceCache.careers) {
    referenceCache.careers = await readReferenceData("/references/desired-careers");
  }
  return referenceCache.careers;
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
  if (!form || form.dataset.simpleSchoolInput === "true") {
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
  help.textContent = "교급, 지역, 학교를 순서대로 선택하면 프로그램 학교명이 자동 입력됩니다.";

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
  const selectionRoot = form?.querySelector("[data-student-selection-root]");
  const selectionSource = selectionRoot?.querySelector("[data-student-selection-source]");
  if (!form || !selectionRoot || !selectionSource) {
    return;
  }

  if (selectionRoot.dataset.selectionReady === "true") {
    return;
  }
  selectionRoot.dataset.selectionReady = "true";

  const curriculumPairs = Array.from({ length: 2 }, (_, index) => {
    const suffix = String(index + 1);
    const subjectInput =
      form.querySelector(`input[name='linked_subject_${suffix}']`) ||
      form.querySelector(`textarea[name='linked_subject_${suffix}']`);
    const unitInput =
      form.querySelector(`input[name='linked_unit_${suffix}']`) ||
      form.querySelector(`textarea[name='linked_unit_${suffix}']`);

    if (!subjectInput || !unitInput) {
      return null;
    }

    const subjectLabel = subjectInput.closest("label");
    const unitLabel = unitInput.closest("label");
    if (subjectLabel) {
      subjectLabel.hidden = true;
    }
    if (unitLabel) {
      unitLabel.hidden = true;
    }
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

    return { suffix, subjectInput, unitInput };
  }).filter(Boolean);

  if (!curriculumPairs.length) {
    return;
  }

  const careerGoalInput =
    form.querySelector("input[name='career_goal']") || form.querySelector("textarea[name='career_goal']");
  const careerMajorInput =
    form.querySelector("input[name='career_major']") || form.querySelector("textarea[name='career_major']");

  const careerGoalLabel = careerGoalInput?.closest("label");
  const careerMajorLabel = careerMajorInput?.closest("label");
  if (careerGoalLabel) {
    careerGoalLabel.hidden = true;
  }
  if (careerMajorLabel) {
    careerMajorLabel.hidden = true;
  }
  if (careerGoalInput) {
    if (careerGoalInput.tagName === "INPUT") {
      careerGoalInput.type = "hidden";
    } else {
      careerGoalInput.hidden = true;
    }
  }
  if (careerMajorInput) {
    if (careerMajorInput.tagName === "INPUT") {
      careerMajorInput.type = "hidden";
    } else {
      careerMajorInput.hidden = true;
    }
  }

  selectionSource.hidden = true;
  const launchGrid = document.createElement("div");
  launchGrid.className = "student-selection-launch-grid";
  selectionRoot.appendChild(launchGrid);

  const createSelectionCard = (title, description, buttonLabel) => {
    const card = document.createElement("div");
    card.className = "student-selection-launch-card";

    const heading = document.createElement("div");
    heading.className = "student-selection-launch-head";

    const titleNode = document.createElement("h5");
    titleNode.textContent = title;

    const descriptionNode = document.createElement("p");
    descriptionNode.textContent = description;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-button student compact-button";
    button.textContent = buttonLabel;

    const summary = document.createElement("div");
    summary.className = "student-selection-summary-card";

    heading.appendChild(titleNode);
    heading.appendChild(descriptionNode);
    card.appendChild(heading);
    card.appendChild(summary);
    card.appendChild(button);

    return { card, button, summary };
  };

  const createSummaryChip = (label, onRemove) => {
    const chip = document.createElement("div");
    chip.className = "student-selection-chip";
    chip.innerHTML = `<span>${escapeHtml(label)}</span>`;
    if (onRemove) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "×";
      removeButton.addEventListener("click", onRemove);
      chip.appendChild(removeButton);
    }
    return chip;
  };

  const createSelectionDialog = (title) => {
    const dialog = document.createElement("dialog");
    dialog.className = "app-modal student-selection-modal";
    dialog.innerHTML = `
      <div class="modal-panel student-selection-modal-panel">
        <div class="student-selection-modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="student-selection-modal-close" aria-label="닫기">×</button>
        </div>
        <div class="student-selection-modal-body"></div>
      </div>
    `;
    dialog.querySelector(".student-selection-modal-close")?.addEventListener("click", () => closeDialog(dialog));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeDialog(dialog);
      }
    });
    document.body.appendChild(dialog);
    return {
      dialog,
      body: dialog.querySelector(".student-selection-modal-body"),
    };
  };

  const curriculumCard = createSelectionCard(
    "교과/단원 선택",
    "교과와 단원을 팝업에서 선택한 뒤 질문지에 반영합니다.",
    "교과/단원 선택",
  );
  const careerCard = createSelectionCard(
    "진로 분야 선택",
    "희망 진로는 최대 3개까지 선택해 질문지에 반영할 수 있습니다.",
    "진로 분야 선택",
  );
  launchGrid.appendChild(curriculumCard.card);
  launchGrid.appendChild(careerCard.card);

  const curriculumDialogParts = createSelectionDialog("교과/단원 선택");
  const careerDialogParts = createSelectionDialog("진로 분야 선택");

  const curriculumState = {
    subject: null,
    selectedSubUnits: [],
  };
  const careerState = {
    options: [],
    selected: [],
  };

  const groupCurricula = (items) => {
    const groups = new Map();
    items.forEach((item) => {
      const groupName =
        item.curriculumCategoryName ||
        item.curriculumGroupName ||
        item.groupName ||
        item.subjectGroupName ||
        "과목 선택";
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName).push(item);
    });
    return Array.from(groups.entries());
  };

  const syncCurriculumHiddenInputs = () => {
    const subjectName = curriculumState.subject?.curriculumName || "";
    const selectedLabels = curriculumState.selectedSubUnits.map(
      (item) => `${subjectName} - ${item.groupName} - ${item.name}`,
    );
    const firstLabel = selectedLabels[0] || "";
    const remainingLabels = selectedLabels.slice(1).join(", ");
    curriculumPairs.forEach((pair, index) => {
      pair.subjectInput.value = subjectName;
      if (index === 0) {
        pair.unitInput.value = firstLabel;
      } else {
        pair.unitInput.value = remainingLabels || firstLabel;
      }
    });
  };

  const renderCurriculumSummary = () => {
    curriculumCard.summary.innerHTML = "";
    const title = document.createElement("div");
    title.className = "student-selection-summary-head";
    title.innerHTML = `<strong>선택한 교과/단원</strong><span>${curriculumState.selectedSubUnits.length} / 3</span>`;
    curriculumCard.summary.appendChild(title);

    if (!curriculumState.subject || !curriculumState.selectedSubUnits.length) {
      const empty = document.createElement("p");
      empty.className = "student-selection-empty";
      empty.textContent = "아직 선택한 교과/단원이 없습니다.";
      curriculumCard.summary.appendChild(empty);
      return;
    }

    const chipWrap = document.createElement("div");
    chipWrap.className = "student-selection-chip-wrap";
    curriculumState.selectedSubUnits.forEach((item, index) => {
      chipWrap.appendChild(
        createSummaryChip(`${curriculumState.subject.curriculumName} - ${item.groupName} - ${item.name}`, () => {
          curriculumState.selectedSubUnits.splice(index, 1);
          syncCurriculumHiddenInputs();
          renderCurriculumSummary();
          renderCurriculumModalSelection();
        }),
      );
    });
    curriculumCard.summary.appendChild(chipWrap);
  };

  const renderCareerSummary = () => {
    careerCard.summary.innerHTML = "";
    const title = document.createElement("div");
    title.className = "student-selection-summary-head";
    title.innerHTML = `<strong>선택한 진로 분야</strong><span>${careerState.selected.length} / 3</span>`;
    careerCard.summary.appendChild(title);

    if (!careerState.selected.length) {
      const empty = document.createElement("p");
      empty.className = "student-selection-empty";
      empty.textContent = "아직 선택한 진로 분야가 없습니다.";
      careerCard.summary.appendChild(empty);
      return;
    }

    const chipWrap = document.createElement("div");
    chipWrap.className = "student-selection-chip-wrap";
    careerState.selected.forEach((item, index) => {
      chipWrap.appendChild(
        createSummaryChip(item.careerField, () => {
          careerState.selected.splice(index, 1);
          syncCareerHiddenInputs();
          renderCareerSummary();
          renderCareerModalSelection();
        }),
      );
    });
    careerCard.summary.appendChild(chipWrap);
  };

  const syncCareerHiddenInputs = () => {
    const careerNames = careerState.selected.map((item) => item.careerField);
    const majors = Array.from(
      new Set(
        careerState.selected
          .flatMap((item) => normalizeKeywords(item.relatedMajors || ""))
          .filter(Boolean),
      ),
    );
    if (careerGoalInput) {
      careerGoalInput.value = careerNames.join(", ");
    }
    if (careerMajorInput) {
      careerMajorInput.value = (majors.join(", ") || careerNames.join(", ")).trim();
    }
  };

  let curriculumModalDom = null;
  let careerModalDom = null;

  const renderCurriculumModalSelection = () => {
    if (!curriculumModalDom) {
      return;
    }
    const { subjectGrid, subjectSelectedText, unitSection, selectedList, selectedCount, confirmButton } = curriculumModalDom;
    subjectSelectedText.textContent = curriculumState.subject
      ? `선택됨: ${curriculumState.subject.curriculumName}`
      : "과목을 먼저 선택해 주세요.";
    if (selectedCount) {
      selectedCount.textContent = `${curriculumState.selectedSubUnits.length} / 3`;
    }

    Array.from(subjectGrid?.querySelectorAll(".student-selection-option-button") || []).forEach((button) => {
      const isSelected =
        button.dataset.curriculumId === String(curriculumState.subject?.curriculumId || "") ||
        button.dataset.curriculumName === String(curriculumState.subject?.curriculumName || "");
      button.classList.toggle("is-selected", isSelected);
    });

    selectedList.innerHTML = "";
    if (curriculumState.selectedSubUnits.length) {
      curriculumState.selectedSubUnits.forEach((item, index) => {
        selectedList.appendChild(
          createSummaryChip(`${curriculumState.subject?.curriculumName || ""} - ${item.groupName} - ${item.name}`, () => {
            curriculumState.selectedSubUnits.splice(index, 1);
            syncCurriculumHiddenInputs();
            renderCurriculumSummary();
            renderCurriculumModalSelection();
          }),
        );
      });
    } else {
      const empty = document.createElement("p");
      empty.className = "student-selection-empty";
      empty.textContent = "선택한 소단원이 없습니다.";
      selectedList.appendChild(empty);
    }

    confirmButton.disabled = !(curriculumState.subject && curriculumState.selectedSubUnits.length);

    if (!curriculumState.subject) {
      unitSection.innerHTML = '<p class="student-selection-empty student-selection-empty-centered">위에서 과목을 먼저 선택해 주세요.</p>';
      return;
    }

    unitSection.innerHTML = "";
    const renderGroups = async () => {
      try {
        const groups = await loadCurriculumUnits(curriculumState.subject.curriculumId);
        if (!groups.length) {
          unitSection.innerHTML = '<p class="student-selection-empty student-selection-empty-centered">표시할 대단원이 없습니다.</p>';
          return;
        }

        for (const group of groups) {
          const details = document.createElement("details");
          details.className = "student-selection-accordion";
          const summary = document.createElement("summary");
          summary.textContent = group.curriculumUnitName || "대단원";
          details.appendChild(summary);

          const box = document.createElement("div");
          box.className = "student-selection-accordion-body";
          box.innerHTML = '<p class="student-selection-empty">소단원 목록을 불러오는 중입니다.</p>';
          details.appendChild(box);
          unitSection.appendChild(details);

          details.addEventListener("toggle", async () => {
            if (!details.open || details.dataset.loaded === "true") {
              return;
            }
            details.dataset.loaded = "true";
            try {
              const subUnits = await loadCurriculumSubUnits(group.curriculumUnitId);
              box.innerHTML = "";
              if (!subUnits.length) {
                box.innerHTML = '<p class="student-selection-empty">표시할 소단원이 없습니다.</p>';
                return;
              }
              subUnits.forEach((subUnit) => {
                const key = String(subUnit.curriculumSubUnitId);
                const row = document.createElement("label");
                row.className = "student-selection-checkbox-row";
                const checked = curriculumState.selectedSubUnits.some((item) => item.id === key);
                row.innerHTML = `
                  <input type="checkbox" ${checked ? "checked" : ""} />
                  <span>${escapeHtml(subUnit.curriculumSubUnitName || "")}</span>
                `;
                const checkbox = row.querySelector("input");
                checkbox.addEventListener("change", () => {
                  const existingIndex = curriculumState.selectedSubUnits.findIndex((item) => item.id === key);
                  if (checkbox.checked) {
                    if (existingIndex === -1 && curriculumState.selectedSubUnits.length >= 3) {
                      checkbox.checked = false;
                      window.alert("교과/단원은 최대 3개까지 선택할 수 있습니다.");
                      return;
                    }
                    if (existingIndex === -1) {
                      curriculumState.selectedSubUnits.push({
                        id: key,
                        name: subUnit.curriculumSubUnitName || "",
                        groupName: group.curriculumUnitName || "",
                      });
                    }
                  } else if (existingIndex !== -1) {
                    curriculumState.selectedSubUnits.splice(existingIndex, 1);
                  }
                  renderCurriculumModalSelection();
                });
                box.appendChild(row);
              });
            } catch {
              box.innerHTML = '<p class="student-selection-empty">소단원 목록을 불러오지 못했습니다.</p>';
            }
          });
        }
      } catch {
        unitSection.innerHTML = '<p class="student-selection-empty student-selection-empty-centered">대단원 목록을 불러오지 못했습니다.</p>';
      }
    };

    renderGroups();
  };

  const openCurriculumDialog = async () => {
    if (!curriculumModalDom) {
      const container = curriculumDialogParts.body;
      const subjectSection = document.createElement("section");
      subjectSection.className = "student-selection-modal-section";
      subjectSection.innerHTML = `
        <div class="student-selection-modal-section-head">
          <strong>과목 선택</strong>
          <span class="student-selection-inline-note" data-subject-selected-text>과목을 먼저 선택해 주세요.</span>
        </div>
        <div class="student-selection-modal-scroll">
          <div class="student-selection-option-grid" data-subject-grid></div>
        </div>
      `;

      const unitSection = document.createElement("section");
      unitSection.className = "student-selection-modal-section";
      unitSection.innerHTML = `
        <div class="student-selection-modal-section-head">
          <div>
            <strong>대단원 / 소단원 선택</strong>
            <p>대단원을 누르면 아래에 소단원이 펼쳐집니다.</p>
          </div>
          <span class="student-selection-inline-note">최대 3개 선택</span>
        </div>
        <div class="student-selection-modal-scroll student-selection-modal-scroll-tall" data-unit-section></div>
      `;

      const selectedSection = document.createElement("section");
      selectedSection.className = "student-selection-modal-section";
      selectedSection.innerHTML = `
        <div class="student-selection-modal-section-head">
          <strong>선택한 소단원</strong>
          <span class="student-selection-inline-note" data-selected-count>0 / 3</span>
        </div>
        <div class="student-selection-chip-wrap" data-selected-unit-list></div>
      `;

      const footer = document.createElement("div");
      footer.className = "student-selection-modal-footer";
      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "primary-button student";
      confirmButton.textContent = "선택 완료";
      confirmButton.disabled = true;
      confirmButton.addEventListener("click", () => {
        syncCurriculumHiddenInputs();
        renderCurriculumSummary();
        closeDialog(curriculumDialogParts.dialog);
      });
      footer.appendChild(confirmButton);

      container.appendChild(subjectSection);
      container.appendChild(unitSection);
      container.appendChild(selectedSection);
      container.appendChild(footer);

      curriculumModalDom = {
        subjectGrid: subjectSection.querySelector("[data-subject-grid]"),
        subjectSelectedText: subjectSection.querySelector("[data-subject-selected-text]"),
        unitSection: unitSection.querySelector("[data-unit-section]"),
        selectedList: selectedSection.querySelector("[data-selected-unit-list]"),
        selectedCount: selectedSection.querySelector("[data-selected-count]"),
        confirmButton,
      };

      try {
        const groupedCurricula = groupCurricula(await loadCurricula());
        curriculumModalDom.subjectGrid.innerHTML = "";
        groupedCurricula.forEach(([groupName, items]) => {
          const group = document.createElement("div");
          group.className = "student-selection-option-group";
          const label = document.createElement("p");
          label.className = "student-selection-option-group-label";
          label.textContent = `[${groupName}]`;
          const grid = document.createElement("div");
          grid.className = "student-selection-option-grid";

          items.forEach((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "student-selection-option-button";
            button.dataset.curriculumId = String(item.curriculumId || "");
            button.dataset.curriculumName = String(item.curriculumName || "");
            button.textContent = item.curriculumName || "";
            button.addEventListener("click", () => {
              curriculumState.subject = item;
              curriculumState.selectedSubUnits = [];
              renderCurriculumModalSelection();
              Array.from(curriculumModalDom.subjectGrid.querySelectorAll(".student-selection-option-button")).forEach((node) => {
                node.classList.toggle("is-selected", node === button);
              });
            });
            grid.appendChild(button);

            if (
              curriculumState.subject &&
              !curriculumState.subject.curriculumId &&
              String(curriculumState.subject.curriculumName || "") === String(item.curriculumName || "")
            ) {
              curriculumState.subject = item;
            }
          });

          group.appendChild(label);
          group.appendChild(grid);
          curriculumModalDom.subjectGrid.appendChild(group);
        });
      } catch {
        curriculumModalDom.subjectGrid.innerHTML = '<p class="student-selection-empty student-selection-empty-centered">과목 목록을 불러오지 못했습니다.</p>';
      }
    }

    curriculumModalDom.selectedCount.textContent = `${curriculumState.selectedSubUnits.length} / 3`;
    renderCurriculumModalSelection();
    openDialog(curriculumDialogParts.dialog);
  };

  const renderCareerModalSelection = () => {
    if (!careerModalDom) {
      return;
    }
    careerModalDom.selectionCount.textContent = `${careerState.selected.length} / 3`;
    careerModalDom.selectedList.innerHTML = "";

    if (!careerState.selected.length) {
      const empty = document.createElement("p");
      empty.className = "student-selection-empty";
      empty.textContent = "아직 선택한 진로 분야가 없습니다.";
      careerModalDom.selectedList.appendChild(empty);
    } else {
      careerState.selected.forEach((item, index) => {
        careerModalDom.selectedList.appendChild(
          createSummaryChip(item.careerField, () => {
            careerState.selected.splice(index, 1);
            syncCareerHiddenInputs();
            renderCareerSummary();
            renderCareerModalSelection();
          }),
        );
      });
    }

    Array.from(careerModalDom.optionGrid.querySelectorAll(".student-selection-option-button")).forEach((button) => {
      button.classList.toggle(
        "is-selected",
        careerState.selected.some((item) => String(item.desiredCareerId) === button.dataset.id),
      );
    });
    careerModalDom.confirmButton.disabled = !careerState.selected.length;
  };

  const openCareerDialog = async () => {
    if (!careerModalDom) {
      const container = careerDialogParts.body;
      const section = document.createElement("section");
      section.className = "student-selection-modal-section";
      section.innerHTML = `
        <div class="student-selection-modal-section-head">
          <strong>진로 분야</strong>
          <span class="student-selection-inline-note">최대 3개 선택</span>
        </div>
        <div class="student-selection-option-grid" data-career-grid></div>
      `;

      const selectedSection = document.createElement("section");
      selectedSection.className = "student-selection-modal-section";
      selectedSection.innerHTML = `
        <div class="student-selection-modal-section-head">
          <strong>선택한 진로 분야</strong>
          <span class="student-selection-inline-note" data-selected-count>0 / 3</span>
        </div>
        <div class="student-selection-chip-wrap" data-selected-careers></div>
      `;

      const footer = document.createElement("div");
      footer.className = "student-selection-modal-footer";
      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "primary-button student";
      confirmButton.textContent = "선택 완료";
      confirmButton.disabled = true;
      confirmButton.addEventListener("click", () => {
        syncCareerHiddenInputs();
        renderCareerSummary();
        closeDialog(careerDialogParts.dialog);
      });
      footer.appendChild(confirmButton);

      container.appendChild(section);
      container.appendChild(selectedSection);
      container.appendChild(footer);

      careerModalDom = {
        optionGrid: section.querySelector("[data-career-grid]"),
        selectedList: selectedSection.querySelector("[data-selected-careers]"),
        selectionCount: selectedSection.querySelector("[data-selected-count]"),
        confirmButton,
      };

      try {
        careerState.options = await loadDesiredCareers();
        careerState.options.forEach((career) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "student-selection-option-button";
          button.dataset.id = String(career.desiredCareerId);
          button.textContent = career.careerField || "";
          button.addEventListener("click", () => {
            const existingIndex = careerState.selected.findIndex(
              (item) => String(item.desiredCareerId) === String(career.desiredCareerId),
            );
            if (existingIndex !== -1) {
              careerState.selected.splice(existingIndex, 1);
            } else {
              if (careerState.selected.length >= 3) {
                window.alert("진로 분야는 최대 3개까지 선택할 수 있습니다.");
                return;
              }
              careerState.selected.push(career);
            }
            syncCareerHiddenInputs();
            renderCareerSummary();
            renderCareerModalSelection();
          });
          careerModalDom.optionGrid.appendChild(button);
        });
      } catch {
        careerModalDom.optionGrid.innerHTML = '<p class="student-selection-empty student-selection-empty-centered">진로 분야 목록을 불러오지 못했습니다.</p>';
      }
    }

    renderCareerModalSelection();
    openDialog(careerDialogParts.dialog);
  };

  const restoreCurriculumSelection = () => {
    const restoredSubject = String(curriculumPairs[0]?.subjectInput.value || curriculumPairs[1]?.subjectInput.value || "").trim();
    const restoredUnits = Array.from(
      new Set(
        curriculumPairs
          .flatMap((pair) => String(pair.unitInput.value || "").split(","))
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
    if (restoredSubject) {
      curriculumState.subject = {
        curriculumId: "",
        curriculumName: restoredSubject,
      };
    }
    curriculumState.selectedSubUnits = restoredUnits.map((entry, index) => {
      const parts = entry.split(" - ").map((item) => item.trim()).filter(Boolean);
      return {
        id: `restored-${index}`,
        groupName: parts.length >= 3 ? parts[1] : (parts[0] || "선택 단원"),
        name: parts.length >= 3 ? parts.slice(2).join(" - ") : (parts.slice(1).join(" - ") || parts[0] || entry),
      };
    });
    renderCurriculumSummary();
  };

  const restoreCareerSelection = async () => {
    try {
      careerState.options = await loadDesiredCareers();
      const existingNames = normalizeKeywords(careerGoalInput?.value || "");
      careerState.selected = existingNames
        .map((name) => careerState.options.find((career) => career.careerField === name))
        .filter(Boolean)
        .slice(0, 3);
    } catch {
      careerState.selected = normalizeKeywords(careerGoalInput?.value || "").slice(0, 3).map((name, index) => ({
        desiredCareerId: `restored-${index}`,
        careerField: name,
        relatedMajors: careerMajorInput?.value || "",
      }));
    }
    syncCareerHiddenInputs();
    renderCareerSummary();
  };

  curriculumCard.button.addEventListener("click", openCurriculumDialog);
  careerCard.button.addEventListener("click", openCareerDialog);

  restoreCurriculumSelection();
  restoreCareerSelection();
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
