def generate(model, request):
    return model.generate(
        text=request["text"],
        ref_audio=request["referencePath"],
        prompt_audio=request["referencePath"],
        prompt_text=request["referenceText"],
        inference_timesteps=request["options"]["steps"],
        cfg_value=request["options"]["cfg"],
        max_tokens=1500,
    )
