document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-tabs]").forEach((tabsRoot) => {
    const buttons = tabsRoot.querySelectorAll("[data-tab-target]");
    const panels = tabsRoot.querySelectorAll("[data-tab-panel]");

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
  });

  document.querySelectorAll("input[name='program_code']").forEach((input) => {
    input.addEventListener("input", (event) => {
      event.currentTarget.value = event.currentTarget.value
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
        .slice(0, 12);
    });
  });

  document.querySelectorAll("[data-teacher-picker]").forEach((picker) => {
    const input = picker.querySelector("[data-teacher-lookup]");
    const hiddenInput = picker.querySelector("[data-teacher-ids]");
    const addButton = picker.querySelector("[data-add-teacher]");
    const selectedList = picker.querySelector("[data-selected-teachers]");
    const dataListId = input?.getAttribute("list");
    const dataList = dataListId ? document.getElementById(dataListId) : null;
    const selectedTeachers = new Map();

    if (!input || !hiddenInput || !addButton || !selectedList || !dataList) {
      return;
    }

    const updateHiddenInput = () => {
      hiddenInput.value = Array.from(selectedTeachers.keys()).join(",");
    };

    const renderSelectedTeachers = () => {
      selectedList.innerHTML = "";
      if (!selectedTeachers.size) {
        const empty = document.createElement("p");
        empty.className = "teacher-picker-empty";
        empty.textContent = "아직 배정된 강사가 없습니다.";
        selectedList.appendChild(empty);
        updateHiddenInput();
        return;
      }

      selectedTeachers.forEach((teacher, teacherId) => {
        const chip = document.createElement("div");
        chip.className = "teacher-chip";
        const textWrap = document.createElement("div");
        textWrap.className = "teacher-chip-text";

        const name = document.createElement("strong");
        name.textContent = teacher.name;
        textWrap.appendChild(name);

        const username = document.createElement("span");
        username.textContent = teacher.username;
        textWrap.appendChild(username);

        const code = document.createElement("code");
        code.textContent = teacher.code;
        textWrap.appendChild(code);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "teacher-chip-remove";
        removeButton.setAttribute("aria-label", "강사 제거");
        removeButton.textContent = "x";
        removeButton.addEventListener("click", () => {
          selectedTeachers.delete(teacherId);
          renderSelectedTeachers();
        });
        chip.appendChild(textWrap);
        chip.appendChild(removeButton);
        selectedList.appendChild(chip);
      });

      updateHiddenInput();
    };

    const addTeacher = () => {
      const matchedOption = Array.from(dataList.querySelectorAll("option")).find(
        (option) => option.value === input.value,
      );
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
        updateHiddenInput();
      }
    });

    renderSelectedTeachers();
  });

  const templateLockModal = document.querySelector("[data-template-lock-modal]");
  if (templateLockModal) {
    const templateNameTarget = templateLockModal.querySelector("[data-template-lock-name]");
    const closeTemplateLockModal = () => {
      templateLockModal.hidden = true;
    };

    document.querySelectorAll("[data-template-lock-trigger]").forEach((button) => {
      button.addEventListener("click", () => {
        if (templateNameTarget) {
          templateNameTarget.textContent = button.dataset.templateName || "Selected";
        }
        templateLockModal.hidden = false;
      });
    });

    templateLockModal.querySelectorAll("[data-template-lock-close]").forEach((button) => {
      button.addEventListener("click", closeTemplateLockModal);
    });

    templateLockModal.addEventListener("click", (event) => {
      if (event.target === templateLockModal) {
        closeTemplateLockModal();
      }
    });
  }

  document.querySelectorAll("[data-program-delete-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

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
        window.alert("프로그램 삭제 중 오류가 발생했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      }
    });
  });

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

  const referenceCache = {
    cities: null,
    curricula: null,
    districts: new Map(),
    schools: new Map(),
    curriculumUnits: new Map(),
    curriculumSubUnits: new Map(),
  };

  const readReferenceData = async (url) => {
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
  };

  const loadCities = async () => {
    if (!referenceCache.cities) {
      referenceCache.cities = await readReferenceData("/references/cities");
    }
    return referenceCache.cities;
  };

  const loadDistricts = async (cityId) => {
    if (!referenceCache.districts.has(cityId)) {
      referenceCache.districts.set(
        cityId,
        await readReferenceData(`/references/${cityId}/districts`),
      );
    }
    return referenceCache.districts.get(cityId) || [];
  };

  const loadSchools = async (districtId, schoolLevel) => {
    const cacheKey = `${districtId}:${schoolLevel}`;
    if (!referenceCache.schools.has(cacheKey)) {
      referenceCache.schools.set(
        cacheKey,
        await readReferenceData(
          `/references/${districtId}/schools?schoolLevel=${schoolLevel}`,
        ),
      );
    }
    return referenceCache.schools.get(cacheKey) || [];
  };

  const loadCurricula = async () => {
    if (!referenceCache.curricula) {
      referenceCache.curricula = await readReferenceData("/references/curricula");
    }
    return referenceCache.curricula;
  };

  const loadCurriculumUnits = async (curriculumId) => {
    if (!referenceCache.curriculumUnits.has(curriculumId)) {
      referenceCache.curriculumUnits.set(
        curriculumId,
        await readReferenceData(`/references/curricula/${curriculumId}`),
      );
    }
    return referenceCache.curriculumUnits.get(curriculumId) || [];
  };

  const loadCurriculumSubUnits = async (curriculumUnitId) => {
    if (!referenceCache.curriculumSubUnits.has(curriculumUnitId)) {
      referenceCache.curriculumSubUnits.set(
        curriculumUnitId,
        await readReferenceData(`/references/curriculumUnit/${curriculumUnitId}`),
      );
    }
    return referenceCache.curriculumSubUnits.get(curriculumUnitId) || [];
  };

  const setSelectOptions = (select, items, placeholder, config = {}) => {
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
  };

  const createReferenceField = (title, select) => {
    const wrapper = document.createElement("div");
    wrapper.className = "reference-select-field";

    const label = document.createElement("small");
    label.className = "reference-select-label";
    label.textContent = title;
    wrapper.appendChild(label);
    wrapper.appendChild(select);
    return wrapper;
  };

  const createSelect = (className = "") => {
    const select = document.createElement("select");
    if (className) {
      select.className = className;
    }
    return select;
  };

  const initAdminSchoolSelector = () => {
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
    selector.className = "reference-enhancer school-selector-panel compact-top";
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

    grid.appendChild(createReferenceField("지역 1", citySelect));
    grid.appendChild(createReferenceField("지역 2", districtSelect));
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
        summary.textContent = `선택된 학교: ${segments.join(" > ")}`;
        return;
      }
      summary.textContent = "선택된 학교가 아직 없습니다.";
    };

    const renderSchoolOptions = () => {
      const keyword = searchInput.value.trim().toLowerCase();
      const filteredOptions = schoolOptions.filter((item) =>
        String(item.name || "")
          .toLowerCase()
          .includes(keyword),
      );
      setSelectOptions(schoolSelect, filteredOptions, filteredOptions.length ? "학교 선택" : "학교 없음", {
        valueKey: "schoolId",
        labelKey: "name",
      });
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
      setSelectOptions(districtSelect, [], cityId ? "불러오는 중..." : "지역 2");
      districtSelect.disabled = !cityId;
      resetSchoolSelection();
      if (!cityId) {
        updateSummary();
        return;
      }
      try {
        const districts = await loadDistricts(cityId);
        setSelectOptions(districtSelect, districts, "지역 2", {
          valueKey: "districtId",
          labelKey: "name",
        });
      } catch (error) {
        districtSelect.disabled = true;
        summary.textContent = "지역 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }
      updateSummary();
    });

    districtSelect.addEventListener("change", async () => {
      selectedDistrictName =
        districtSelect.options[districtSelect.selectedIndex]?.textContent || "";
      try {
        await loadSchoolOptionsForDistrict();
      } catch (error) {
        summary.textContent = "학교 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }
      updateSummary();
    });

    schoolSelect.addEventListener("change", () => {
      schoolNameInput.value =
        schoolSelect.options[schoolSelect.selectedIndex]?.textContent || "";
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

    setSelectOptions(citySelect, [], "지역 1");
    updateSummary();
    syncLevelButtons();

    loadCities()
      .then((cities) => {
        setSelectOptions(citySelect, cities, "지역 1", {
          valueKey: "cityId",
          labelKey: "name",
        });
      })
      .catch(() => {
        summary.textContent = "학교 선택 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      });
  };

  const initStudentCurriculumSelectors = () => {
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
      selector.className = "reference-enhancer curriculum-selector-panel compact-top";
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
          summary.textContent = `선택된 교과/단원: ${subjectInput.value} > ${unitInput.value}`;
          return;
        }
        if (subjectInput.value) {
          summary.textContent = `선택된 교과: ${subjectInput.value}`;
          return;
        }
        summary.textContent = "선택된 교과/단원이 아직 없습니다.";
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

      subjectSelect.addEventListener("change", async () => {
        const selectedOption = subjectSelect.options[subjectSelect.selectedIndex];
        subjectInput.value = selectedOption?.textContent === "교과" ? "" : selectedOption?.textContent || "";
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
        } catch (error) {
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
        } catch (error) {
          summary.textContent = "세부 단원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        }
      });

      subUnitSelect.addEventListener("change", () => {
        unitInput.value =
          subUnitSelect.options[subUnitSelect.selectedIndex]?.textContent === "세부 단원"
            ? ""
            : subUnitSelect.options[subUnitSelect.selectedIndex]?.textContent || "";
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

      loadCurricula()
        .then((curricula) => {
          setSelectOptions(subjectSelect, curricula, "교과", {
            valueKey: "curriculumId",
            labelKey: "curriculumName",
          });
        })
        .catch(() => {
          summary.textContent = "교과 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        });
    });
  };

  initAdminSchoolSelector();
  initStudentCurriculumSelectors();
});
