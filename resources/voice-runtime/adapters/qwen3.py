def generate(model, request):
    return model.generate(
        text=request["text"],
        ref_audio=request["referencePath"],
        ref_text=request["referenceText"],
        lang_code="English" if request["options"]["language"] == "en" else "Chinese",
        temperature=request["options"]["temperature"],
        max_tokens=2048,
        verbose=False,
    )
