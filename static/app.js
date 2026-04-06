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
});
