import before_surf


def test_version_is_nonempty_string():
    assert isinstance(before_surf.__version__, str)
    assert before_surf.__version__
